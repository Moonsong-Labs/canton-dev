#!/usr/bin/env bash
set -euo pipefail

LEDGER_HOST=${LEDGER_HOST:-localhost}
LEDGER_PORT=${LEDGER_PORT:-5011}
NAV_PORT=${NAV_PORT:-7500}

echo "=== Start Daml Navigator ==="
echo "Ledger: ${LEDGER_HOST}:${LEDGER_PORT}"
echo "Port:   ${NAV_PORT} (UI)"

echo "> Launching Navigator..."
# In this SDK, navigator expects ledger host/port as positional args to `server`
# and uses --port for the UI port.
daml navigator server \
  "${LEDGER_HOST}" "${LEDGER_PORT}" \
  --port "${NAV_PORT}"
