"""The models. Turns one JPEG into numbers, in memory, and keeps nothing.

- MediaPipe Face Landmarker: head turn and expression for the live check.
- OpenCV YuNet + SFace: count faces and compare two faces 1-to-1.
"""

import threading

import cv2
import mediapipe as mp
import numpy as np

from app.challenges import FrameSignals
from app.settings import MODELS_DIR

MAX_SIDE = 640
# OpenCV's published threshold for SFace cosine similarity.
SAME_PERSON_COSINE = 0.363

NOSE_TIP, EYE_A, EYE_B = 1, 33, 263


def _decode(jpeg: bytes) -> np.ndarray | None:
    image = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]
    scale = MAX_SIDE / max(height, width)
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)))
    return image


class FaceEngine:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_buffer=(MODELS_DIR / "face_landmarker.task").read_bytes()
            ),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=2,
            output_face_blendshapes=True,
        )
        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        self._detector = cv2.FaceDetectorYN.create(
            str(MODELS_DIR / "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.8, 0.3, 5000
        )
        self._recognizer = cv2.FaceRecognizerSF.create(
            str(MODELS_DIR / "face_recognition_sface_2021dec.onnx"), ""
        )

    def signals(self, jpeg: bytes) -> FrameSignals:
        image = _decode(jpeg)
        if image is None:
            return FrameSignals(faces=0)
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        with self._lock:
            result = self._landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        faces = len(result.face_landmarks)
        if faces != 1:
            return FrameSignals(faces=faces)
        points = result.face_landmarks[0]
        eye_a, eye_b, nose = points[EYE_A], points[EYE_B], points[NOSE_TIP]
        eye_distance = abs(eye_b.x - eye_a.x) or 1e-6
        yaw = (nose.x - (eye_a.x + eye_b.x) / 2) / eye_distance
        shapes = {c.category_name: c.score for c in result.face_blendshapes[0]}
        return FrameSignals(
            faces=1,
            yaw=float(yaw),
            jaw_open=float(shapes.get("jawOpen", 0.0)),
            smile=float((shapes.get("mouthSmileLeft", 0.0) + shapes.get("mouthSmileRight", 0.0)) / 2),
        )

    def embed(self, jpeg: bytes) -> tuple[int, np.ndarray | None]:
        """(number of faces, face data for exactly one face). Caller must not keep it."""
        image = _decode(jpeg)
        if image is None:
            return 0, None
        with self._lock:
            self._detector.setInputSize((image.shape[1], image.shape[0]))
            _, found = self._detector.detect(image)
            count = 0 if found is None else len(found)
            if count != 1:
                return count, None
            aligned = self._recognizer.alignCrop(image, found[0])
            return 1, self._recognizer.feature(aligned).copy()

    def same_person(self, a: np.ndarray, b: np.ndarray) -> bool:
        with self._lock:
            score = self._recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE)
        return bool(score >= SAME_PERSON_COSINE)
