"""The only place the face service reads settings from the environment."""

import os
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def face_service_secret() -> str:
    value = os.environ.get("FACE_SERVICE_SECRET", "")
    if not value:
        raise RuntimeError("Missing setting FACE_SERVICE_SECRET. See .env.example.")
    return value


def selfie_store() -> str:
    """'disk' lets the web server fetch the reference selfie once (testing only)."""
    return os.environ.get("SELFIE_STORE", "memory")
