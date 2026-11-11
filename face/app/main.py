"""PresenSee face service.

Only the PresenSee web server may call this service: every request must carry
the shared secret. The service keeps nothing on disk and never logs request
bodies, images or face data.
"""

import hmac
import logging

from fastapi import Depends, FastAPI, Header, HTTPException

from app.settings import face_service_secret

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


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


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
