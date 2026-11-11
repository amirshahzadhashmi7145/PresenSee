"""Test helpers. No real face images are used anywhere in these tests:
a fake engine reads the 'frame' bytes as JSON numbers instead of pixels."""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.challenges import FrameSignals

SECRET = "test-secret-not-real"
HEADERS = {"x-face-secret": SECRET}


def frame(faces=1, yaw=0.0, jaw=0.0, smile=0.0, person=1) -> bytes:
    return json.dumps({"faces": faces, "yaw": yaw, "jaw": jaw, "smile": smile, "person": person}).encode()


class FakeEngine:
    def __init__(self) -> None:
        self.embed_calls = 0

    def signals(self, jpeg: bytes) -> FrameSignals:
        d = json.loads(jpeg)
        return FrameSignals(faces=d["faces"], yaw=d["yaw"], jaw_open=d["jaw"], smile=d["smile"])

    def embed(self, jpeg: bytes):
        self.embed_calls += 1
        d = json.loads(jpeg)
        if d["faces"] != 1:
            return d["faces"], None
        return 1, np.array([float(d["person"])])

    def same_person(self, a, b) -> bool:
        return bool(a[0] == b[0])


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FACE_SERVICE_SECRET", SECRET)
    monkeypatch.setenv("SELFIE_STORE", "memory")
    from app.main import app
    from app.sessions import SessionStore

    clock = Clock()
    app.state.sessions = SessionStore(clock=clock)
    app.state.engine = FakeEngine()
    yield type("Env", (), {"app": app, "clock": clock, "client": TestClient(app), "engine": app.state.engine})
    app.state.engine = None


def good_burst(challenge: str, person: int = 1) -> list[bytes]:
    move = {
        "turn_left": dict(yaw=0.3),
        "turn_right": dict(yaw=-0.3),
        "open_mouth": dict(jaw=0.7),
        "smile": dict(smile=0.8),
    }[challenge]
    return [frame(person=person)] * 4 + [frame(person=person, **move)] * 6


def post_step(client, session_id: str, frames: list[bytes], account_id: str = "acct-a"):
    files = [("frames", (f"{i}.jpg", data, "image/jpeg")) for i, data in enumerate(frames)]
    return client.post(
        f"/liveness/{session_id}/step", data={"account_id": account_id}, files=files, headers=HEADERS
    )
