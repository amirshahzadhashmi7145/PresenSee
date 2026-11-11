"""The live check over HTTP, with a fake engine (no real images)."""

from app.sessions import REFERENCE_SECONDS, SESSION_SECONDS, STEP_SECONDS
from tests.conftest import HEADERS, frame, good_burst, post_step


def start(env, account_id: str = "acct-a") -> dict:
    res = env.client.post("/liveness/start", json={"account_id": account_id}, headers=HEADERS)
    assert res.status_code == 200
    return res.json()


def pass_all(env, account_id: str = "acct-a") -> str:
    view = start(env, account_id)
    sid = view["session_id"]
    while True:
        body = post_step(env.client, sid, good_burst(view["challenge"]), account_id).json()
        if body["result"] == "passed":
            return sid
        assert body["result"] == "next"
        view = body


def test_full_live_check_passes(env) -> None:
    view = start(env)
    assert view["step"] == 1 and view["total"] == 3
    pass_all(env)


def test_a_still_photo_fails_and_ends_the_session(env) -> None:
    view = start(env)
    body = post_step(env.client, view["session_id"], [frame()] * 10).json()
    assert body == {"result": "failed", "reason": "move_not_seen"}
    # The session is gone: no second try on the same session.
    again = post_step(env.client, view["session_id"], good_burst(view["challenge"]))
    assert again.status_code == 404


def test_another_account_cannot_use_my_session(env) -> None:
    """Hard rule: never compare against other users."""
    view = start(env, "acct-a")
    res = post_step(env.client, view["session_id"], good_burst(view["challenge"]), account_id="acct-b")
    assert res.status_code == 404


def test_a_different_person_mid_session_fails(env) -> None:
    view = start(env)
    body = post_step(env.client, view["session_id"], good_burst(view["challenge"], person=1)).json()
    assert body["result"] == "next"
    body = post_step(env.client, view["session_id"], good_burst(body["challenge"], person=2)).json()
    assert body == {"result": "failed", "reason": "different_person"}


def test_answering_too_slowly_fails(env) -> None:
    view = start(env)
    env.clock.t += STEP_SECONDS + 1
    body = post_step(env.client, view["session_id"], good_burst(view["challenge"])).json()
    assert body == {"result": "failed", "reason": "too_slow"}


def test_an_expired_session_is_gone(env) -> None:
    view = start(env)
    env.clock.t += SESSION_SECONDS + 1
    assert post_step(env.client, view["session_id"], good_burst(view["challenge"])).status_code == 404
    assert len(env.app.state.sessions) == 0


def test_a_passed_session_cannot_be_replayed(env) -> None:
    sid = pass_all(env)
    assert post_step(env.client, sid, good_burst("smile")).status_code == 404


def test_starting_again_drops_the_old_session(env) -> None:
    first = start(env)
    start(env)
    assert post_step(env.client, first["session_id"], good_burst(first["challenge"])).status_code == 404
    assert len(env.app.state.sessions) == 1


def test_oversized_frames_are_refused(env) -> None:
    view = start(env)
    body = post_step(env.client, view["session_id"], [b"x" * 300_001] * 10).json()
    assert body == {"result": "failed", "reason": "frame_too_big"}


def test_reference_selfie_is_dropped_after_its_time(env) -> None:
    """Hard rule: selfie data does not linger."""
    pass_all(env)
    store = env.app.state.sessions
    assert len(store) == 1
    env.clock.t += REFERENCE_SECONDS + 1
    store.sweep()
    assert len(store) == 0


def test_forgetting_an_account_drops_its_selfie(env) -> None:
    pass_all(env, "acct-a")
    pass_all(env, "acct-b")
    res = env.client.delete("/liveness/account/acct-a", headers=HEADERS)
    assert res.json() == {"dropped": 1}
    assert len(env.app.state.sessions) == 1


def test_reference_is_not_handed_out_in_memory_mode(env) -> None:
    sid = pass_all(env)
    res = env.client.get(f"/liveness/{sid}/reference", params={"account_id": "acct-a"}, headers=HEADERS)
    assert res.status_code == 404


def test_reference_is_handed_out_once_in_disk_mode(env, monkeypatch) -> None:
    monkeypatch.setenv("SELFIE_STORE", "disk")
    sid = pass_all(env)
    url = f"/liveness/{sid}/reference"
    other = env.client.get(url, params={"account_id": "acct-b"}, headers=HEADERS)
    assert other.status_code == 404
    first = env.client.get(url, params={"account_id": "acct-a"}, headers=HEADERS)
    assert first.status_code == 200 and first.headers["content-type"] == "image/jpeg"
    second = env.client.get(url, params={"account_id": "acct-a"}, headers=HEADERS)
    assert second.status_code == 404


def test_logs_never_contain_frame_data(env, caplog) -> None:
    """Hard rule: never write image or face data to logs."""
    import logging

    caplog.set_level(logging.DEBUG)
    marker = "UNIQUE-FRAME-MARKER-123"
    view = start(env)
    frames = [frame()] * 4 + [frame(yaw=0.3)] * 6
    frames[0] = frames[0] + b" " + marker.encode()
    post_step(env.client, view["session_id"], [f if marker.encode() not in f else frame() for f in frames])
    start(env)
    pass_all(env)
    text = caplog.text
    assert marker not in text
    assert '"yaw"' not in text and "acct-a" not in text
