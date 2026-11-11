#!/usr/bin/env bash
# Shared setup for dev.sh and test.sh. Source it, do not run it.
# - creates .env from .env.example on first use, with fresh random secrets
# - loads .env into the environment
# - keeps every tool cache on the project drive (the system disk is small)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  hex_db="$(openssl rand -hex 24)"
  hex_face="$(openssl rand -hex 32)"
  b64_key="$(openssl rand -base64 32)"
  sed \
    -e "s|^POSTGRES_PASSWORD=CHANGE_ME_HEX|POSTGRES_PASSWORD=${hex_db}|" \
    -e "s|^\(DATABASE_URL=.*\)CHANGE_ME_HEX|\1${hex_db}|" \
    -e "s|^FACE_SERVICE_SECRET=CHANGE_ME_HEX|FACE_SERVICE_SECRET=${hex_face}|" \
    -e "s|^PHOTO_ENC_KEY_K1=CHANGE_ME_BASE64|PHOTO_ENC_KEY_K1=${b64_key}|" \
    "$ROOT/.env.example" > "$ROOT/.env"
  chmod 600 "$ROOT/.env"
  unset hex_db hex_face b64_key
  echo "Created .env with fresh random secrets."
fi

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

export XDG_CACHE_HOME="$ROOT/.cache"
export npm_config_cache="$ROOT/.cache/npm"
