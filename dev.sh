#!/usr/bin/env bash
# Start everything for local testing:  bash dev.sh
# Then open http://localhost:3000   (stop with Ctrl+C)
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/env.sh"

echo "Starting the database..."
docker compose -f "$ROOT/compose.yaml" up -d --wait db

echo "Preparing the web app..."
pnpm -C "$ROOT/web" install
pnpm -C "$ROOT/web" exec prisma generate
pnpm -C "$ROOT/web" exec prisma migrate deploy

trap 'kill 0' EXIT
echo "Starting the face service on port ${FACE_PORT}..."
( cd "$ROOT/face" && exec uv run python -m uvicorn app.main:app \
    --host 127.0.0.1 --port "${FACE_PORT}" --reload --reload-dir app ) &

echo "Starting the web app on http://localhost:${WEB_PORT} ..."
pnpm -C "$ROOT/web" exec next dev -H 127.0.0.1 -p "${WEB_PORT}" &

wait -n
