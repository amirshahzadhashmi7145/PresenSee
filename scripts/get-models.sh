#!/usr/bin/env bash
# Download the face models into face/models and verify their checksums.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/face/models"
mkdir -p "$DIR"

fetch() { # name url sha256
  local name="$1" url="$2" want="$3" file="$DIR/$1"
  if [ -f "$file" ] && [ "$(sha256sum "$file" | cut -d' ' -f1)" = "$want" ]; then return 0; fi
  echo "Downloading $name ..."
  curl -fsSL --retry 3 -o "$file.part" "$url"
  local got; got="$(sha256sum "$file.part" | cut -d' ' -f1)"
  if [ "$got" != "$want" ]; then
    rm -f "$file.part"
    echo "Checksum mismatch for $name (got $got)" >&2
    return 1
  fi
  mv "$file.part" "$file"
}

fetch face_detection_yunet_2023mar.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
  8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
fetch face_recognition_sface_2021dec.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx \
  0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79
fetch face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task \
  64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
