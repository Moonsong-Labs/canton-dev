#!/usr/bin/env bash
#
# postCreateCommand — sanity checks. Surfaces breakage immediately rather
# than at first plugin use. Runs once after the container is created.
#
# Background: SDK 3.4.x+ ships via dpm, which does NOT expose a top-level
# `daml` binary. Everything goes through `dpm <subcommand>`. Our plugin's
# DamlBinaryLocator picks dpm by default and invokes `<dpm> damlc ide ...`
# at runtime; that is the canonical pattern for current SDKs. SDK 2.x via
# the legacy `daml` assistant is the fallback (separate stable template).

set -euo pipefail

echo "──────────────────────────────────────────────────────────────"
echo " canton-dev JetBrains devcontainer — post-create sanity checks"
echo "──────────────────────────────────────────────────────────────"

fail=0

ok()   { printf "  %-44s OK\n"      "$1"; }
miss() { printf "  %-44s MISSING\n" "$1"; fail=1; }

if command -v dpm >/dev/null 2>&1; then ok "dpm assistant on PATH"
else miss "dpm assistant on PATH"; fi

if dpm version >/dev/null 2>&1; then ok "dpm version reports an SDK"
else miss "dpm version reports an SDK"; fi

if dpm damlc --help >/dev/null 2>&1; then ok "dpm damlc invokable"
else miss "dpm damlc invokable"; fi

if [ -d /opt/jetbrains-plugins/canton-jetbrains-plugin/lib ]; then
    ok "DAML plugin staged at /opt/jetbrains-plugins"
else
    miss "DAML plugin staged at /opt/jetbrains-plugins"
fi

if [ -f /etc/idea/idea.properties ]; then ok "/etc/idea/idea.properties exists"
else miss "/etc/idea/idea.properties exists"; fi

if [ "${IDEA_PROPERTIES:-}" = "/etc/idea/idea.properties" ]; then ok "IDEA_PROPERTIES env"
else miss "IDEA_PROPERTIES env (got '${IDEA_PROPERTIES:-<unset>}')"; fi

# Optional: legacy `daml` binary is absent on dpm-based SDKs (3.4+). Do not
# fail on this; just report.
if command -v daml >/dev/null 2>&1; then
    ok "legacy 'daml' assistant on PATH (optional)"
else
    printf "  %-44s absent (expected on dpm SDKs)\n" "legacy 'daml' assistant"
fi

echo
echo "── effective config ──"
echo "  dpm:             $(command -v dpm 2>/dev/null || echo '<unset>')"
echo "  dpm version:"
dpm version 2>&1 | sed 's/^/    /' || true
echo "  IDEA_PROPERTIES: ${IDEA_PROPERTIES:-<unset>}"
[ -f /etc/idea/idea.properties ] && {
    echo "  contents:"
    sed 's/^/    /' /etc/idea/idea.properties
}
echo "  plugin dir:      $(ls -1d /opt/jetbrains-plugins/*/ 2>/dev/null || echo '<none>')"

echo
if [ $fail -eq 0 ]; then
    echo "Pre-flight OK. Connect with JetBrains Gateway or Toolbox."
    echo "On first connect the IntelliJ Community backend downloads (~700 MB)."
    echo "Then LSP4IJ installs from Marketplace; the DAML plugin loads from /opt/jetbrains-plugins."
    echo
    echo "The DAML plugin will spawn 'dpm damlc ide' (or 'dpm damlc multi-ide' if a"
    echo "multi-package.yaml is at the workspace root)."
else
    echo "One or more checks failed. See output above."
    exit 1
fi
