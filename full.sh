#!/usr/bin/env bash
# Run everything in Docker:  bash full.sh   (then open http://localhost:3000)
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/env.sh"
docker compose -f "$ROOT/compose.yaml" --profile full up --build
