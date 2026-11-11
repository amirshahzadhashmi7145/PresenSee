import pytest
from fastapi.testclient import TestClient

SECRET = "test-secret-not-real"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("FACE_SERVICE_SECRET", SECRET)
    from app.main import app

    return TestClient(app)


def test_health_needs_the_shared_secret(client: TestClient) -> None:
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"x-face-secret": "wrong"}).status_code == 401


def test_health_answers_with_the_secret(client: TestClient) -> None:
    res = client.get("/health", headers={"x-face-secret": SECRET})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_only_the_allowed_routes_exist(client: TestClient) -> None:
    """Hard rule: 1-to-1 only. New routes must be added to this list on purpose."""
    from app.main import app

    paths = sorted({route.path for route in app.routes})
    assert paths == ["/health"]


def test_refuses_to_start_checks_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FACE_SERVICE_SECRET", raising=False)
    from app.main import app

    with pytest.raises(RuntimeError):
        TestClient(app).get("/health", headers={"x-face-secret": "anything"})
