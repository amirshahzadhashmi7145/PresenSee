"""PresenSee face service.

Only the PresenSee web server may call this service: every request must carry
the shared secret. The service keeps nothing on disk and never logs request
bodies, images or face data.

It can do exactly two things with faces:
  1. the live check (frames from one camera session), and
  2. compare one upload with that same account's own live selfie.
There is no route that compares two arbitrary faces, enrols a face or searches faces.
"""

import hmac
import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel

from app import challenges
from app.sessions import STEP_SECONDS, Session, SessionStore
from app.settings import face_service_secret, selfie_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("face")

MAX_FRAME_BYTES = 300_000
MAX_PHOTO_BYTES = 10 * 1024 * 1024


def require_secret(x_face_secret: str | None = Header(default=None)) -> None:
    """Refuse any caller that does not know the shared secret."""
    expected = face_service_secret()
    if x_face_secret is None or not hmac.compare_digest(x_face_secret, expected):
        raise HTTPException(status_code=401, detail="not allowed")


# No docs pages and no open routes: everything sits behind the secret.
app = FastAPI(
    title="PresenSee face service",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    dependencies=[Depends(require_secret)],
)
app.state.sessions = SessionStore()
app.state.engine = None  # loaded on first use; tests put a fake here


def get_engine():
    if app.state.engine is None:
        from app.engine import FaceEngine

        app.state.engine = FaceEngine()
    return app.state.engine


def get_sessions() -> SessionStore:
    return app.state.sessions


class StartBody(BaseModel):
    account_id: str


def _view(session: Session) -> dict:
    return {
        "session_id": session.id,
        "step": session.step + 1,
        "total": len(session.challenges),
        "challenge": session.challenges[session.step],
        "seconds": STEP_SECONDS,
    }


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/liveness/start")
def liveness_start(body: StartBody) -> dict:
    session = get_sessions().create(body.account_id, challenges.pick_challenges())
    log.info("live check started")
    return _view(session)


@app.post("/liveness/{session_id}/step")
async def liveness_step(
    session_id: str,
    account_id: Annotated[str, Form()],
    frames: Annotated[list[UploadFile], File()],
) -> dict:
    sessions = get_sessions()
    session = sessions.get(session_id, account_id)
    if session is None or session.status != "pending":
        raise HTTPException(status_code=404, detail="no such live check")

    def fail(reason: str) -> dict:
        sessions.drop(session.id)
        log.info("live check failed reason=%s", reason)
        return {"result": "failed", "reason": reason}

    if sessions.now() - session.step_issued_at > STEP_SECONDS:
        return fail("too_slow")
    if len(frames) > challenges.MAX_FRAMES:
        return fail("too_many_frames")

    jpegs: list[bytes] = []
    for frame in frames:
        data = await frame.read(MAX_FRAME_BYTES + 1)
        if len(data) > MAX_FRAME_BYTES:
            return fail("frame_too_big")
        jpegs.append(data)

    engine = get_engine()
    challenge = session.challenges[session.step]
    burst = challenges.check_burst([engine.signals(j) for j in jpegs], challenge)
    if not burst.ok:
        return fail(burst.reason)

    # The relaxed frame of this burst must show one face, and the same person
    # as the first burst. Face data lives only inside this function.
    count, face = engine.embed(jpegs[burst.neutral_index])
    if count != 1 or face is None:
        return fail("face_not_clear")
    if session.reference_jpeg is None:
        session.reference_jpeg = jpegs[burst.neutral_index]
    else:
        _, first = engine.embed(session.reference_jpeg)
        if first is None or not engine.same_person(first, face):
            return fail("different_person")
    del face, jpegs

    session.step += 1
    if session.step < len(session.challenges):
        session.step_issued_at = sessions.now()
        return {"result": "next", **_view(session)}

    session.status = "passed"
    session.passed_at = sessions.now()
    log.info("live check passed")
    return {"result": "passed"}


@app.get("/liveness/{session_id}/reference")
def liveness_reference(session_id: str, account_id: str) -> Response:
    """Testing only (SELFIE_STORE=disk): hand the reference selfie to the web server, once."""
    if selfie_store() != "disk":
        raise HTTPException(status_code=404, detail="not available")
    session = get_sessions().get(session_id, account_id)
    if session is None or session.status != "passed" or session.reference_jpeg is None:
        raise HTTPException(status_code=404, detail="no such live check")
    if session.reference_handed_out:
        raise HTTPException(status_code=404, detail="already taken")
    session.reference_handed_out = True
    return Response(content=session.reference_jpeg, media_type="image/jpeg")


@app.post("/liveness/restore")
async def liveness_restore(
    account_id: Annotated[str, Form()],
    reference: Annotated[UploadFile, File()],
) -> dict:
    """Testing only (SELFIE_STORE=disk): after a restart, the web server gives back
    the account's own saved reference selfie so uploads can still be compared."""
    if selfie_store() != "disk":
        raise HTTPException(status_code=404, detail="not available")
    data = await reference.read(MAX_FRAME_BYTES + 1)
    if len(data) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="too big")
    count, _ = get_engine().embed(data)
    if count != 1:
        raise HTTPException(status_code=422, detail="reference not usable")
    get_sessions().restore(account_id, data)
    return {"ok": True}


@app.post("/match")
async def match(
    account_id: Annotated[str, Form()],
    photo: Annotated[UploadFile, File()],
) -> dict:
    """Does this upload show exactly one face, and is it the same person as this
    account's own live selfie? The answer is yes or no. No score, no face data,
    and nothing is kept: both sets of face numbers die when this function ends."""
    session = get_sessions().passed_for_account(account_id)
    if session is None or session.reference_jpeg is None:
        raise HTTPException(status_code=409, detail="no_live_check")
    data = await photo.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        return {"result": "rejected", "reason": "too_big"}

    engine = get_engine()
    count, upload_face = engine.embed(data)
    del data
    if count == 0:
        return {"result": "rejected", "reason": "no_face"}
    if count > 1 or upload_face is None:
        return {"result": "rejected", "reason": "more_than_one_face"}
    _, selfie_face = engine.embed(session.reference_jpeg)
    if selfie_face is None:
        raise HTTPException(status_code=409, detail="no_live_check")
    same = engine.same_person(selfie_face, upload_face)
    del upload_face, selfie_face
    log.info("match checked result=%s", "match" if same else "not_same_person")
    return {"result": "match"} if same else {"result": "rejected", "reason": "not_same_person"}


@app.delete("/liveness/account/{account_id}")
def liveness_forget(account_id: str) -> dict:
    """Drop every live-check session of this account (used by delete-my-account)."""
    return {"dropped": get_sessions().drop_account(account_id)}
