#!/usr/bin/env bash
set -euo pipefail

# Install the DAML VS Code/Cursor extension (bundled in the SDK) into the
# remote server inside the devcontainer.

DAML_SDK_VERSION="${DAML_SDK_VERSION:-2.10.2}"
VSIX_PATH="/home/daml/.daml/sdk/${DAML_SDK_VERSION}/studio/daml-bundled.vsix"

echo "[daml-vsix] Starting DAML VSIX setup"
echo "[daml-vsix] DAML SDK Version: ${DAML_SDK_VERSION}"
echo "[daml-vsix] Expected VSIX: ${VSIX_PATH}"

# Check if we have a local copy of the VSIX
if [[ -f "/home/daml/daml-bundled.vsix" ]]; then
  echo "[daml-vsix] Using local VSIX copy at /home/daml/daml-bundled.vsix"
  VSIX_PATH="/home/daml/daml-bundled.vsix"
elif [[ ! -f "$VSIX_PATH" ]]; then
  echo "[daml-vsix] WARNING: VSIX not found at ${VSIX_PATH}"
  echo "[daml-vsix] Checking for DAML installation..."

  # Try to find DAML in common locations
  if [[ -d "/home/daml/.daml" ]]; then
    echo "[daml-vsix] Found .daml directory, checking SDK versions:"
    ls -la /home/daml/.daml/sdk/ 2>/dev/null || echo "No SDK directory"
  fi

  # Since VSIX is not critical for container operation, just warn
  echo "[daml-vsix] Extension will need manual installation"
  echo "[daml-vsix] Continuing without VSIX installation..."
  exit 0
fi

find_code_server() {
  local candidates=(
    "/home/daml/.vscode-server/bin"
    "/home/daml/.vscode-server-insiders/bin"
    "/home/daml/.cursor-server/bin"  # Added Cursor support
    "$HOME/.vscode-server/bin"
    "$HOME/.vscode-server-insiders/bin"
    "$HOME/.cursor-server/bin"  # Added Cursor support
  )
  for base in "${candidates[@]}"; do
    if [[ -d "$base" ]]; then
      local first
      first=$(ls -d "$base"/* 2>/dev/null | head -n1 || true)
      if [[ -n "$first" ]]; then
        # Check for VS Code server
        if [[ -x "$first/bin/code-server" ]]; then
          echo "$first/bin/code-server"
          return 0
        fi
        # Check for Cursor server (different structure)
        if [[ -x "$first/bin/cursor-server" ]]; then
          echo "$first/bin/cursor-server"
          return 0
        fi
        # Fallback to newer remote CLI form
        if [[ -f "$first/bin/remote-cli/cli.js" && -x "$first/node" ]]; then
          echo "$first/bin/remote-cli/cli.js|$first/node"
          return 0
        fi
      fi
    fi
  done
  return 1
}

CODE_SERVER_BIN=""
REMOTE_CLI_JS=""
REMOTE_NODE=""

# Wait a bit for VS Code server to appear on first attach
for i in $(seq 1 ${DAML_VSIX_WAIT_SECS:-30}); do
  found=$(find_code_server || true)
  if [[ -n "$found" ]]; then
    if [[ "$found" == *"|"* ]]; then
      REMOTE_CLI_JS="${found%|*}"
      REMOTE_NODE="${found#*|}"
    else
      CODE_SERVER_BIN="$found"
    fi
    break
  fi
  if [[ $i -eq 1 ]]; then
    echo "[daml-vsix] Waiting for VS Code server to initialize..."
  fi
  sleep 1
done

if [[ -x "${CODE_SERVER_BIN:-}" ]]; then
  echo "[daml-vsix] Found VS Code server CLI: ${CODE_SERVER_BIN}"
  if "${CODE_SERVER_BIN}" --install-extension "${VSIX_PATH}" >/dev/null 2>&1; then
    echo "[daml-vsix] Installed DAML VSIX (or it was already installed)."
  else
    echo "[daml-vsix] Extension install command returned non-zero (non-fatal)."
  fi
  if "${CODE_SERVER_BIN}" --list-extensions 2>/dev/null | grep -Eiq 'daml'; then
    echo "[daml-vsix] Verification: DAML extension is present."
  else
    echo "[daml-vsix] Verification: Could not confirm DAML extension via list."
  fi
elif [[ -f "${REMOTE_CLI_JS:-}" && -x "${REMOTE_NODE:-}" ]]; then
  echo "[daml-vsix] Found VS Code remote CLI: ${REMOTE_CLI_JS} (node: ${REMOTE_NODE})"
  if "${REMOTE_NODE}" "${REMOTE_CLI_JS}" --install-extension "${VSIX_PATH}" >/dev/null 2>&1; then
    echo "[daml-vsix] Installed DAML VSIX via remote CLI (or it was already installed)."
  else
    echo "[daml-vsix] Remote CLI install returned non-zero (non-fatal)."
  fi
  if "${REMOTE_NODE}" "${REMOTE_CLI_JS}" --list-extensions 2>/dev/null | grep -Eiq 'daml'; then
    echo "[daml-vsix] Verification: DAML extension is present."
  else
    echo "[daml-vsix] Verification: Could not confirm DAML extension via list."
  fi
else
  echo "[daml-vsix] Code server not detected after wait. Attempting direct install by unpacking VSIX."
  if command -v unzip >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    tmp=$(mktemp -d)
    if unzip -q "$VSIX_PATH" -d "$tmp"; then
      id=$(node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(`${j.publisher}.${j.name}-${j.version}`);' "$tmp/extension/package.json" 2>/dev/null || true)
      if [[ -n "$id" ]]; then
        # Install to both VS Code and Cursor extension directories
        for ext_dir in "$HOME/.vscode-server/extensions" "$HOME/.vscode-server-insiders/extensions" "$HOME/.cursor-server/extensions"; do
          if [[ -d "$(dirname "$ext_dir")" ]]; then
            mkdir -p "$ext_dir/$id"
            cp -a "$tmp/extension/." "$ext_dir/$id/"
            echo "[daml-vsix] Unpacked extension to $ext_dir/$id"
          fi
        done
        echo "[daml-vsix] ✓ Successfully installed DAML extension via manual unpack"
      else
        echo "[daml-vsix] WARNING: Could not parse extension id from package.json"
        echo "[daml-vsix] Extension may need manual installation"
      fi
    else
      echo "[daml-vsix] WARNING: unzip failed; cannot unpack VSIX."
      echo "[daml-vsix] Extension may need manual installation"
    fi
    rm -rf "$tmp"
  else
    echo "[daml-vsix] WARNING: unzip/node not available; cannot unpack VSIX."
    echo "[daml-vsix] Extension may need manual installation"
  fi
fi

# Final verification
echo "[daml-vsix] Final checks..."
echo "[daml-vsix] Checking for installed extensions in common directories:"
for dir in "$HOME/.vscode-server/extensions" "$HOME/.cursor-server/extensions"; do
  if [[ -d "$dir" ]]; then
    echo "[daml-vsix] Extensions in $dir:"
    ls "$dir" 2>/dev/null | grep -i daml || echo "  No DAML extension found"
  fi
done

echo "[daml-vsix] Setup completed"
echo "[daml-vsix] Note: If extension is not loaded, you can manually install from: /home/daml/daml-bundled.vsix"
exit 0


