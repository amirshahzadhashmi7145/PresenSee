"""Live-check sessions, kept in memory only. Nothing here touches disk."""

import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field

SESSION_SECONDS = 120          # time allowed to finish all challenges
STEP_SECONDS = 20              # time allowed to answer one challenge
REFERENCE_SECONDS = 15 * 60    # how long a passed selfie stays in memory


@dataclass
class Session:
    id: str
    account_id: str
    challenges: list[str]
    created_at: float
    step: int = 0
    step_issued_at: float = 0.0
    status: str = "pending"  # pending | passed | failed
    passed_at: float = 0.0
    reference_jpeg: bytes | None = field(default=None, repr=False)
    reference_handed_out: bool = False


class SessionStore:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._sessions: dict[str, Session] = {}

    def now(self) -> float:
        return self._clock()

    def create(self, account_id: str, challenges: list[str]) -> Session:
        self.sweep()
        # One live check per account at a time.
        for sid in [s.id for s in self._sessions.values() if s.account_id == account_id]:
            self.drop(sid)
        now = self.now()
        session = Session(
            id=secrets.token_urlsafe(24),
            account_id=account_id,
            challenges=challenges,
            created_at=now,
            step_issued_at=now,
        )
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str, account_id: str) -> Session | None:
        """Only the owning account can reach a session."""
        self.sweep()
        session = self._sessions.get(session_id)
        if session is None or not secrets.compare_digest(session.account_id, account_id):
            return None
        return session

    def drop(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session is not None:
            session.reference_jpeg = None

    def drop_account(self, account_id: str) -> int:
        ids = [s.id for s in self._sessions.values() if s.account_id == account_id]
        for sid in ids:
            self.drop(sid)
        return len(ids)

    def sweep(self) -> None:
        now = self.now()
        for session in list(self._sessions.values()):
            if session.status == "passed":
                expired = now - session.passed_at > REFERENCE_SECONDS
            else:
                expired = now - session.created_at > SESSION_SECONDS
            if expired or session.status == "failed":
                self.drop(session.id)

    def __len__(self) -> int:
        return len(self._sessions)
