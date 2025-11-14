#!/usr/bin/env bash
set -euo pipefail

# Install the DAML VS Code/Cursor extension (bundled in the SDK) inside
# the devcontainer after VS Code/Cursor attaches.

DAML_SDK_VERSION="${DAML_SDK_VERSION:-3.4.7}"

log() { echo "[daml-vsix] $*"; }

find_vsix() {
  # dpm 3.4+ layout (component version may differ from SDK version)
  local cache_path
  cache_path=$(find /home/daml/.dpm/cache/components/damlc -name "daml-bundled.vsix" -type f 2>/dev/null | head -n1 || true)
  if [[ -n "$cache_path" ]]; then
    log "Found VSIX in dpm cache: $cache_path"
    VSIX_PATH="$cache_path"
    return
  fi

  # legacy paths / manual copy
  local candidates=(
    "/home/daml/.daml/sdk/${DAML_SDK_VERSION}/studio/daml-bundled.vsix"
    "/home/daml/daml-bundled.vsix"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      log "Found VSIX at: $candidate"
      VSIX_PATH="$candidate"
      return
    fi
  done
}

find_code_server() {
  local roots=(
    "/home/daml/.vscode-server/bin" "/home/daml/.vscode-server-insiders/bin" "/home/daml/.cursor-server/bin"
    "$HOME/.vscode-server/bin" "$HOME/.vscode-server-insiders/bin" "$HOME/.cursor-server/bin"
  )
  for base in "${roots[@]}"; do
    [[ -d "$base" ]] || continue
    local first
    first=$(ls -d "$base"/* 2>/dev/null | head -n1 || true)
    [[ -n "$first" ]] || continue
    if [[ -x "$first/bin/code-server" ]]; then
      CODE_SERVER_BIN="$first/bin/code-server"
      return 0
    fi
    if [[ -x "$first/bin/cursor-server" ]]; then
      CODE_SERVER_BIN="$first/bin/cursor-server"
      return 0
    fi
    if [[ -f "$first/bin/remote-cli/cli.js" && -x "$first/node" ]]; then
      REMOTE_CLI_JS="$first/bin/remote-cli/cli.js"
      REMOTE_NODE="$first/node"
      return 0
    fi
  done
  return 1
}

install_via_cli() {
  if [[ -n "${CODE_SERVER_BIN:-}" ]]; then
    log "Installing via ${CODE_SERVER_BIN}"
    "${CODE_SERVER_BIN}" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1 || log "CLI install returned non-zero (non-fatal)"
    "${CODE_SERVER_BIN}" --list-extensions 2>/dev/null | grep -Eiq 'daml' && log "Extension present"
    return 0
  fi
  if [[ -n "${REMOTE_CLI_JS:-}" && -n "${REMOTE_NODE:-}" ]]; then
    log "Installing via remote CLI"
    "${REMOTE_NODE}" "${REMOTE_CLI_JS}" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1 || log "Remote CLI install returned non-zero (non-fatal)"
    "${REMOTE_NODE}" "${REMOTE_CLI_JS}" --list-extensions 2>/dev/null | grep -Eiq 'daml' && log "Extension present"
    return 0
  fi
  return 1
}

manual_unpack() {
  command -v unzip >/dev/null 2>&1 || return 1
  command -v node >/dev/null 2>&1 || return 1
  local tmp
  tmp=$(mktemp -d -t daml-vsix.XXXXXX)
  trap "rm -rf '$tmp'" EXIT
  unzip -q "$VSIX_PATH" -d "$tmp" || return 1
  local id
  id=$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(`${j.publisher}.${j.name}-${j.version}`);' "$tmp/extension/package.json" 2>/dev/null || true)
  [[ -n "$id" ]] || return 1
  for ext_dir in "$HOME/.vscode-server/extensions" "$HOME/.vscode-server-insiders/extensions" "$HOME/.cursor-server/extensions"; do
    mkdir -p "$ext_dir/$id"
    cp -a "$tmp/extension/." "$ext_dir/$id/" 2>/dev/null && log "Unpacked extension to $ext_dir/$id"
  done
  return 0
}

log "Starting DAML VSIX setup (SDK $DAML_SDK_VERSION)"
VSIX_PATH=""
find_vsix

if [[ -z "$VSIX_PATH" ]]; then
  log "VSIX not found in dpm cache or legacy paths"
  log "Will rely on 'dpm studio' / manual install"
  exit 0
fi

CODE_SERVER_BIN=""
REMOTE_CLI_JS=""
REMOTE_NODE=""
for _ in $(seq 1 "${DAML_VSIX_WAIT_SECS:-30}"); do
  find_code_server && break
  [[ -n "${CODE_SERVER_BIN}${REMOTE_CLI_JS}" ]] || sleep 1
done

if install_via_cli; then
  log "VSIX installed via CLI"
elif manual_unpack; then
  log "VSIX installed via manual unpack"
else
  log "WARNING: Could not install VSIX automatically"
  log "You can install manually from: $VSIX_PATH"
fi

log "Installed extensions overview:"
for dir in "$HOME/.vscode-server/extensions" "$HOME/.cursor-server/extensions"; do
  [[ -d "$dir" ]] || continue
  log "  $dir"
  ls "$dir" | grep -i daml || log "  (no DAML extension detected)"
fi

log "Setup completed"
exit 0


