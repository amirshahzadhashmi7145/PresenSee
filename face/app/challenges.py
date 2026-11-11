"""Pure rules for the live check. No images and no models in this file.

A burst is the list of per-frame signals for one challenge. The rules ask:
did one single face start relaxed and then really make the requested move?
"""

import random
from dataclasses import dataclass

CHALLENGES = ("turn_left", "turn_right", "open_mouth", "smile")
CHALLENGES_PER_SESSION = 3

MIN_FRAMES = 8
MAX_FRAMES = 40
MIN_FACE_RATIO = 0.9

# Relaxed face: looking at the camera, mouth closed, not smiling.
NEUTRAL_YAW = 0.12
NEUTRAL_JAW = 0.20
NEUTRAL_SMILE = 0.35

# How far a move must go to count.
TARGET_YAW = 0.22
TARGET_JAW = 0.45
TARGET_SMILE = 0.55
TARGET_FRAMES_IN_A_ROW = 2


@dataclass(frozen=True)
class FrameSignals:
    """What the model saw in one frame. Numbers only, never pixels."""

    faces: int
    # Nose offset from the middle of the eyes, in eye-distances.
    # Positive = the person turned to THEIR left (camera image is not mirrored).
    yaw: float = 0.0
    jaw_open: float = 0.0
    smile: float = 0.0


@dataclass(frozen=True)
class BurstResult:
    ok: bool
    reason: str = ""
    neutral_index: int = -1


def pick_challenges(rng: random.Random | None = None) -> list[str]:
    """A random order with at least one head turn and one expression."""
    rng = rng or random.SystemRandom()
    while True:
        picked = rng.sample(CHALLENGES, CHALLENGES_PER_SESSION)
        has_turn = any(c.startswith("turn_") for c in picked)
        has_expression = any(c in ("open_mouth", "smile") for c in picked)
        if has_turn and has_expression:
            return picked


def is_neutral(s: FrameSignals) -> bool:
    return (
        s.faces == 1
        and abs(s.yaw) < NEUTRAL_YAW
        and s.jaw_open < NEUTRAL_JAW
        and s.smile < NEUTRAL_SMILE
    )


def reached(s: FrameSignals, challenge: str) -> bool:
    if s.faces != 1:
        return False
    if challenge == "turn_left":
        return s.yaw >= TARGET_YAW
    if challenge == "turn_right":
        return s.yaw <= -TARGET_YAW
    if challenge == "open_mouth":
        return s.jaw_open >= TARGET_JAW and abs(s.yaw) < TARGET_YAW
    if challenge == "smile":
        return s.smile >= TARGET_SMILE and abs(s.yaw) < TARGET_YAW
    raise ValueError("unknown challenge")


def check_burst(signals: list[FrameSignals], challenge: str) -> BurstResult:
    if len(signals) < MIN_FRAMES:
        return BurstResult(False, "too_few_frames")
    if len(signals) > MAX_FRAMES:
        return BurstResult(False, "too_many_frames")
    if any(s.faces > 1 for s in signals):
        return BurstResult(False, "more_than_one_face")
    with_face = sum(1 for s in signals if s.faces == 1)
    if with_face / len(signals) < MIN_FACE_RATIO:
        return BurstResult(False, "face_not_visible")

    # The burst must begin relaxed: a still photo of the move does not count.
    head = signals[: max(3, len(signals) * 4 // 10)]
    neutral_index = next((i for i, s in enumerate(head) if is_neutral(s)), -1)
    if neutral_index < 0:
        return BurstResult(False, "start_relaxed")

    # Then the move must be seen, after the relaxed frame, for frames in a row.
    run = 0
    for s in signals[neutral_index + 1 :]:
        run = run + 1 if reached(s, challenge) else 0
        if run >= TARGET_FRAMES_IN_A_ROW:
            return BurstResult(True, "", neutral_index)
    return BurstResult(False, "move_not_seen")
