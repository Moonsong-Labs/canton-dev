#!/usr/bin/env bash
set -euo pipefail

# DAML_SDK_VERSION is set by the Dockerfile as an ENV variable
if [[ -z "${DAML_SDK_VERSION:-}" ]]; then
  echo "[daml-vsix] Error: DAML_SDK_VERSION environment variable not set"
  exit 1
fi

find_vsix() {
  local cache_path
  cache_path=$(find /home/daml/.dpm/cache/components/damlc -name "daml-bundled.vsix" -type f 2>/dev/null | head -n1 || true)
  if [[ -n "$cache_path" ]]; then
    VSIX_PATH="$cache_path"
    return
  fi
  local candidates=(
    "/home/daml/.daml/sdk/${DAML_SDK_VERSION}/studio/daml-bundled.vsix"
    "/home/daml/daml-bundled.vsix"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      VSIX_PATH="$candidate"
      return
    fi
  done
  VSIX_PATH=""
}

find_code_server() {
  local roots=(
    "/home/daml/.vscode-server/bin" "/home/daml/.vscode-server-insiders/bin" "/home/daml/.cursor-server/bin"
    "$HOME/.vscode-server/bin" "$HOME/.vscode-server-insiders/bin" "$HOME/.cursor-server/bin"
  )
  for base in "${roots[@]}"; do
    [[ -d "$base" ]] || continue
    local first=""
    for entry in "$base"/*; do
      [[ -e "$entry" ]] && first="$entry" && break
    done
    [[ -n "$first" ]] || continue
    if [[ -x "$first/bin/code-server" ]]; then
      CODE_SERVER_BIN="$first/bin/code-server"
      CODE_SERVER_RESULT="Code server: FOUND ($CODE_SERVER_BIN)"
      return 0
    fi
    if [[ -x "$first/bin/cursor-server" ]]; then
      CODE_SERVER_BIN="$first/bin/cursor-server"
      CODE_SERVER_RESULT="Code server: FOUND ($CODE_SERVER_BIN)"
      return 0
    fi
    if [[ -f "$first/bin/remote-cli/cli.js" && -x "$first/node" ]]; then
      REMOTE_CLI_JS="$first/bin/remote-cli/cli.js"
      REMOTE_NODE="$first/node"
      CODE_SERVER_RESULT="Code server: FOUND (${REMOTE_NODE} ${REMOTE_CLI_JS})"
      return 0
    fi
  done
  CODE_SERVER_RESULT="Code server: NOT FOUND"
  return 1
}

install_via_cli() {
  if [[ -n "${CODE_SERVER_BIN:-}" ]]; then
    if "${CODE_SERVER_BIN}" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1; then
      INSTALL_RESULT="Extension install: SUCCESS via code-server"
      return 0
    fi
    INSTALL_RESULT="Extension install: FAILURE via code-server"
    return 1
  fi
  if [[ -n "${REMOTE_CLI_JS:-}" && -n "${REMOTE_NODE:-}" ]]; then
    if "${REMOTE_NODE}" "${REMOTE_CLI_JS}" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1; then
      INSTALL_RESULT="Extension install: SUCCESS via remote CLI"
      return 0
    fi
    INSTALL_RESULT="Extension install: FAILURE via remote CLI"
    return 1
  fi
  INSTALL_RESULT="Extension install: SKIPPED (no CLI available)"
  return 1
}

VSIX_PATH=""
find_vsix
if [[ -z "$VSIX_PATH" ]]; then
  CODE_SERVER_RESULT="Code server: SKIPPED (VSIX missing)"
  INSTALL_RESULT="Extension install: FAILURE (VSIX not found)"
else
  CODE_SERVER_BIN=""
  REMOTE_CLI_JS=""
  REMOTE_NODE=""
  find_code_server || true
  install_via_cli || true
fi

echo "[daml-vsix] $CODE_SERVER_RESULT"
echo "[daml-vsix] $INSTALL_RESULT"


