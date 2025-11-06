#!/usr/bin/env bash
set -euo pipefail

LEDGER_HOST=${LEDGER_HOST:-localhost}
LEDGER_PORT=${LEDGER_PORT:-5011}

usage() {
  echo "Usage: LEDGER_HOST=localhost LEDGER_PORT=5011 $0 <dar-path> [--script <Module:setup>]" >&2
}

if [ $# -lt 1 ]; then
  usage
  exit 2
fi

DAR_PATH="$1"
shift || true

SCRIPT_NAME=""
if [ "${1:-}" = "--script" ]; then
  shift
  SCRIPT_NAME="${1:-}"
  if [ -z "$SCRIPT_NAME" ]; then
    echo "Error: --script requires a value like Module:setup" >&2
    exit 2
  fi
  shift || true
fi

if [ ! -f "$DAR_PATH" ]; then
  echo "Error: DAR not found: $DAR_PATH" >&2
  exit 1
fi

echo "=== Deploy DAR ==="
echo "Ledger: ${LEDGER_HOST}:${LEDGER_PORT}"
echo "DAR:    ${DAR_PATH}"
if [ -n "$SCRIPT_NAME" ]; then
  echo "Script: ${SCRIPT_NAME}"
fi

echo "> Uploading DAR..."
daml ledger upload-dar \
  --host "${LEDGER_HOST}" \
  --port "${LEDGER_PORT}" \
  "${DAR_PATH}"

echo "> DAR uploaded successfully."

if [ -n "$SCRIPT_NAME" ]; then
  echo "> Running Daml Script ${SCRIPT_NAME}..."
  daml script \
    --dar "${DAR_PATH}" \
    --script-name "${SCRIPT_NAME}" \
    --ledger-host "${LEDGER_HOST}" \
    --ledger-port "${LEDGER_PORT}"
  echo "> Script completed."
fi

echo "=== Done ==="
