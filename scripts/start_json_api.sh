#!/usr/bin/env bash
set -euo pipefail

LEDGER_HOST=${LEDGER_HOST:-localhost}
LEDGER_PORT=${LEDGER_PORT:-5011}
HTTP_PORT=${HTTP_PORT:-7575}

echo "=== Start Daml JSON API ==="
echo "Ledger: ${LEDGER_HOST}:${LEDGER_PORT}"
echo "HTTP:   ${HTTP_PORT}"

echo "> Launching JSON API..."
daml json-api \
  --ledger-host "${LEDGER_HOST}" \
  --ledger-port "${LEDGER_PORT}" \
  --http-port "${HTTP_PORT}"

