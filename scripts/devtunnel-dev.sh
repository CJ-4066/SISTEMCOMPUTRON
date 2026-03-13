#!/usr/bin/env bash

set -euo pipefail

DEFAULT_TUNNEL_URL="https://r6jv0kcd-5173.brs.devtunnels.ms"
INPUT="${1:-${TUNNEL_URL:-${TUNNEL_HOST:-$DEFAULT_TUNNEL_URL}}}"

TUNNEL_HOST="$(
  node -e '
    const input = String(process.argv[1] || "").trim();

    if (!input) {
      process.exit(1);
    }

    try {
      process.stdout.write(new URL(input).hostname);
      process.exit(0);
    } catch (_error) {
      const normalized = input
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "")
        .trim();

      if (!normalized) {
        process.exit(1);
      }

      process.stdout.write(normalized);
    }
  ' "$INPUT"
)"

if [[ -z "$TUNNEL_HOST" ]]; then
  echo "No se pudo resolver el host del tunel." >&2
  exit 1
fi

echo "Tunel configurado para https://$TUNNEL_HOST"
export VITE_ALLOWED_HOSTS="$TUNNEL_HOST"

exec npm run dev
