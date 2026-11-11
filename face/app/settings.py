"""The only place the face service reads settings from the environment."""

import os


def face_service_secret() -> str:
    value = os.environ.get("FACE_SERVICE_SECRET", "")
    if not value:
        raise RuntimeError("Missing setting FACE_SERVICE_SECRET. See .env.example.")
    return value
