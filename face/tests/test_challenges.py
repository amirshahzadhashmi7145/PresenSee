"""Rules of the live check, tested with numbers only (no images)."""

import random

from app.challenges import CHALLENGES, FrameSignals, check_burst, pick_challenges

RELAXED = FrameSignals(faces=1)
LEFT = FrameSignals(faces=1, yaw=0.3)
RIGHT = FrameSignals(faces=1, yaw=-0.3)
MOUTH = FrameSignals(faces=1, jaw_open=0.7)
SMILE = FrameSignals(faces=1, smile=0.8)
MOVES = {"turn_left": LEFT, "turn_right": RIGHT, "open_mouth": MOUTH, "smile": SMILE}


def burst(move: FrameSignals) -> list[FrameSignals]:
    return [RELAXED] * 4 + [move] * 6


def test_each_real_move_passes() -> None:
    for name, move in MOVES.items():
        assert check_burst(burst(move), name).ok, name


def test_a_still_photo_fails_every_challenge() -> None:
    """Hard rule: a photo of a photo must not pass. Nothing moves in a still."""
    for name in CHALLENGES:
        result = check_burst([RELAXED] * 10, name)
        assert not result.ok and result.reason == "move_not_seen"


def test_a_still_photo_of_the_move_itself_fails() -> None:
    for name, move in MOVES.items():
        result = check_burst([move] * 10, name)
        assert not result.ok and result.reason == "start_relaxed"


def test_the_wrong_move_fails() -> None:
    assert not check_burst(burst(RIGHT), "turn_left").ok
    assert not check_burst(burst(LEFT), "turn_right").ok
    assert not check_burst(burst(SMILE), "open_mouth").ok
    assert not check_burst(burst(MOUTH), "smile").ok
    assert not check_burst(burst(LEFT), "smile").ok


def test_a_single_flicker_frame_is_not_enough() -> None:
    frames = [RELAXED] * 4 + [LEFT] + [RELAXED] * 5
    assert check_burst(frames, "turn_left").reason == "move_not_seen"


def test_two_faces_in_any_frame_fails() -> None:
    frames = burst(LEFT)
    frames[2] = FrameSignals(faces=2)
    assert check_burst(frames, "turn_left").reason == "more_than_one_face"


def test_face_missing_too_often_fails() -> None:
    frames = [RELAXED] * 4 + [FrameSignals(faces=0)] * 3 + [LEFT] * 3
    assert check_burst(frames, "turn_left").reason == "face_not_visible"


def test_frame_count_limits() -> None:
    assert check_burst([RELAXED] * 3, "smile").reason == "too_few_frames"
    assert check_burst([RELAXED] * 41, "smile").reason == "too_many_frames"


def test_challenge_order_is_random_and_mixed() -> None:
    rng = random.Random(7)
    seen = {tuple(pick_challenges(rng)) for _ in range(200)}
    assert len(seen) > 5
    for picked in seen:
        assert len(picked) == 3 and len(set(picked)) == 3
        assert any(c.startswith("turn_") for c in picked)
        assert any(c in ("open_mouth", "smile") for c in picked)
