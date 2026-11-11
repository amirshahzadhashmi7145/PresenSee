"""The 1-to-1 match over HTTP, with a fake engine (no real images)."""

import inspect

from app.sessions import REFERENCE_SECONDS
from tests.conftest import HEADERS, frame
from tests.test_liveness_api import pass_all


def match(env, account_id: str, photo: bytes):
    return env.client.post(
        "/match",
        data={"account_id": account_id},
        files={"photo": ("p.jpg", photo, "image/jpeg")},
        headers=HEADERS,
    )


def test_no_match_without_a_passed_live_check(env) -> None:
    res = match(env, "acct-a", frame(person=1))
    assert res.status_code == 409
    assert env.engine.embed_calls == 0  # the upload was not even looked at


def test_same_person_matches(env) -> None:
    pass_all(env, "acct-a")
    assert match(env, "acct-a", frame(person=1)).json() == {"result": "match"}


def test_a_different_person_is_rejected(env) -> None:
    pass_all(env, "acct-a")
    assert match(env, "acct-a", frame(person=2)).json() == {"result": "rejected", "reason": "not_same_person"}


def test_no_face_and_two_faces_are_rejected(env) -> None:
    pass_all(env, "acct-a")
    assert match(env, "acct-a", frame(faces=0)).json() == {"result": "rejected", "reason": "no_face"}
    assert match(env, "acct-a", frame(faces=2)).json() == {
        "result": "rejected",
        "reason": "more_than_one_face",
    }


def test_my_upload_is_never_compared_with_another_accounts_selfie(env) -> None:
    """Hard rule: 1-to-1 only, never against other users."""
    pass_all(env, "acct-a")  # only account A has a selfie; it shows person 1
    res = match(env, "acct-b", frame(person=1))
    assert res.status_code == 409


def test_match_stops_working_when_the_selfie_expires(env) -> None:
    pass_all(env, "acct-a")
    env.clock.t += REFERENCE_SECONDS + 1
    assert match(env, "acct-a", frame(person=1)).status_code == 409


def test_match_takes_one_image_only(env) -> None:
    """Hard rule: no route compares two caller-supplied faces."""
    from app.main import match as match_route

    params = set(inspect.signature(match_route).parameters)
    assert params == {"account_id", "photo"}


def test_answer_has_no_score_or_face_data(env) -> None:
    pass_all(env, "acct-a")
    assert set(match(env, "acct-a", frame(person=1)).json()) == {"result"}


def test_restore_is_refused_in_memory_mode(env) -> None:
    res = env.client.post(
        "/liveness/restore",
        data={"account_id": "acct-a"},
        files={"reference": ("r.jpg", frame(person=1), "image/jpeg")},
        headers=HEADERS,
    )
    assert res.status_code == 404
    assert match(env, "acct-a", frame(person=1)).status_code == 409


def test_restore_works_in_disk_mode_for_that_account_only(env, monkeypatch) -> None:
    monkeypatch.setenv("SELFIE_STORE", "disk")
    res = env.client.post(
        "/liveness/restore",
        data={"account_id": "acct-a"},
        files={"reference": ("r.jpg", frame(person=1), "image/jpeg")},
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert match(env, "acct-a", frame(person=1)).json() == {"result": "match"}
    assert match(env, "acct-b", frame(person=1)).status_code == 409


def test_logs_have_no_image_or_account_data(env, caplog) -> None:
    import logging

    caplog.set_level(logging.DEBUG)
    pass_all(env, "acct-a")
    match(env, "acct-a", frame(person=1))
    assert "acct-a" not in caplog.text and '"person"' not in caplog.text
