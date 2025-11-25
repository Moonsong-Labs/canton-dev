#!/bin/bash
set -euo pipefail

echo "Stopping any running DAML LSP processes..."
pkill -f "damlc (multi-ide|ide)" >/dev/null 2>&1 || true

echo "Starting DAML LSP in multi-ide mode..."
/home/daml/.dpm/bin/dpm damlc multi-ide --optOutTelemetry --log-level=Debug >/tmp/daml-lsp.log 2>&1 &

echo "DAML LSP restarted. Logs redirected to /tmp/daml-lsp.log"
