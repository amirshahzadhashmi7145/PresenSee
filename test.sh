#!/usr/bin/env bash
# Run all tests:  bash test.sh
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/env.sh"

docker compose -f "$ROOT/compose.yaml" up -d --wait db
pnpm -C "$ROOT/web" install
pnpm -C "$ROOT/web" exec prisma generate
pnpm -C "$ROOT/web" exec prisma migrate deploy

echo "== web tests =="
pnpm -C "$ROOT/web" exec vitest run

echo "== face tests =="
( cd "$ROOT/face" && uv run pytest -q )
