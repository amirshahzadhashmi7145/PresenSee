import pytest
from fastapi.testclient import TestClient

from tests.conftest import HEADERS


def test_health_needs_the_shared_secret(env) -> None:
    assert env.client.get("/health").status_code == 401
    assert env.client.get("/health", headers={"x-face-secret": "wrong"}).status_code == 401


def test_health_answers_with_the_secret(env) -> None:
    res = env.client.get("/health", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_every_route_needs_the_secret(env) -> None:
    assert env.client.post("/liveness/start", json={"account_id": "a"}).status_code == 401
    assert env.client.delete("/liveness/account/a").status_code == 401


def test_only_the_allowed_routes_exist(env) -> None:
    """Hard rule: 1-to-1 only. A new route must be added to this list on purpose.
    Nothing here takes two arbitrary faces, enrols a face or searches faces."""
    routes = sorted(
        (sorted(route.methods - {"HEAD", "OPTIONS"})[0], route.path) for route in env.app.routes
    )
    assert routes == [
        ("DELETE", "/liveness/account/{account_id}"),
        ("GET", "/health"),
        ("GET", "/liveness/{session_id}/reference"),
        ("POST", "/liveness/restore"),
        ("POST", "/liveness/start"),
        ("POST", "/liveness/{session_id}/step"),
        ("POST", "/match"),
    ]


def test_refuses_to_work_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FACE_SERVICE_SECRET", raising=False)
    from app.main import app

    with pytest.raises(RuntimeError):
        TestClient(app).get("/health", headers={"x-face-secret": "anything"})
