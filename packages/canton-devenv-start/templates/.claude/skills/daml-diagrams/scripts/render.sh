#!/usr/bin/env bash
# Render a PlantUML diagram to PNG. Optionally open it after rendering.
#
# Usage:
#   render.sh path/to/diagram.puml [--open]
#   render.sh -t svg path/to/diagram.puml      # alternate format
#   render.sh --help
#
# Default output is PNG at 200 DPI (looks crisp on retina displays and
# embeds reliably in docs, slides, and chat tools). Pass -t svg for vector
# output when you need to embed in a web page or scale arbitrarily.
# Requires: plantuml on $PATH. On macOS: brew install plantuml.

set -euo pipefail

print_help() {
  cat <<'EOF'
render.sh — render PlantUML diagrams produced by the daml-diagrams skill.

Usage:
  render.sh [-t FORMAT] [--dpi N] FILE [FILE...] [--open]

Options:
  -t FORMAT      Output format: png (default), svg, pdf, eps.
  --dpi N        DPI for PNG output (default 200; ignored for vector formats).
  --open         Open the rendered file in the default viewer after rendering.
  -h, --help     Show this message.

Examples:
  render.sh dvp.puml
  render.sh -t svg dvp.puml
  render.sh --dpi 300 dvp.puml
  render.sh dvp.puml --open
EOF
}

if [[ $# -eq 0 ]]; then
  print_help
  exit 1
fi

if ! command -v plantuml >/dev/null 2>&1; then
  echo "error: plantuml is not on \$PATH." >&2
  echo "       Install with: brew install plantuml" >&2
  echo "       (also installs Java and Graphviz as dependencies)" >&2
  exit 1
fi

format="png"
dpi=200
open_after=false
files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    -t)
      format="$2"
      shift 2
      ;;
    --dpi)
      dpi="$2"
      shift 2
      ;;
    --open)
      open_after=true
      shift
      ;;
    *)
      files+=("$1")
      shift
      ;;
  esac
done

if [[ ${#files[@]} -eq 0 ]]; then
  echo "error: no input file given." >&2
  print_help
  exit 1
fi

# Build the plantuml argument list. -SdpiCommandLine only matters for raster
# formats; PlantUML ignores it for svg/pdf/eps but it does no harm to pass it.
plantuml_args=("-t${format}")
if [[ "$format" == "png" ]]; then
  plantuml_args+=("-SdpiCommandLine=${dpi}")
fi
plantuml "${plantuml_args[@]}" "${files[@]}"

if [[ "$open_after" == "true" ]]; then
  for f in "${files[@]}"; do
    # PlantUML writes the output alongside the input, replacing the extension.
    # When the .puml file contains '@startuml NAME', the output filename is NAME.<format>.
    # When it does not, the output filename mirrors the input basename.
    base="${f%.*}"
    candidate1="${base}.${format}"
    # Best-effort: open whichever output exists in the same directory.
    dir="$(dirname "$f")"
    if [[ -f "$candidate1" ]]; then
      open "$candidate1"
    else
      # Find the most recently-written output file in the same dir.
      latest=$(ls -t "$dir"/*."${format}" 2>/dev/null | head -1 || true)
      [[ -n "$latest" ]] && open "$latest"
    fi
  done
fi
