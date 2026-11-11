# Face models

The model files are not stored in git. `scripts/get-models.sh` downloads them
here and checks each file against a pinned SHA-256.

| File | Purpose | Publisher | Licence |
|---|---|---|---|
| `face_detection_yunet_2023mar.onnx` | Find and count faces | OpenCV Zoo | MIT |
| `face_recognition_sface_2021dec.onnx` | 1-to-1 face match | OpenCV Zoo | Apache 2.0 |
| `face_landmarker.task` | Head turn and expression for the live check | Google MediaPipe | Apache 2.0 |

Sources:
- https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
- https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
