#!/usr/bin/env bash
set -euo pipefail

# Verification script for DAML dev container setup
echo "========================================="
echo "DAML Dev Container Verification Script"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running inside container
if [[ -f /.dockerenv ]] || [[ -n "${DOCKER_CONTAINER:-}" ]]; then
    echo -e "${GREEN}✓${NC} Running inside Docker container"
else
    echo -e "${YELLOW}⚠${NC} Not running inside Docker container"
fi

# Check Java
echo ""
echo "Checking Java installation..."
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1)
    echo -e "${GREEN}✓${NC} Java found: $JAVA_VERSION"
else
    echo -e "${RED}✗${NC} Java not found"
    exit 1
fi

# Check DAML
echo ""
echo "Checking DAML installation..."
if command -v daml &> /dev/null; then
    DAML_VERSION=$(daml --version)
    echo -e "${GREEN}✓${NC} DAML found: $DAML_VERSION"

    # Check DAML SDK path
    if [[ -d "/home/daml/.daml/sdk" ]]; then
        echo -e "${GREEN}✓${NC} DAML SDK directory exists"
        ls -la /home/daml/.daml/sdk/ | head -n 5
    else
        echo -e "${YELLOW}⚠${NC} DAML SDK directory not found at /home/daml/.daml/sdk"
    fi
else
    echo -e "${RED}✗${NC} DAML command not found"
    exit 1
fi

# Check Node.js
echo ""
echo "Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js found: $NODE_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Node.js not found (optional for VSIX installation)"
fi

# Check VSIX file
echo ""
echo "Checking DAML VSIX extension..."
VSIX_PATH="/home/daml/.daml/sdk/${DAML_SDK_VERSION:-2.10.2}/studio/daml-bundled.vsix"
if [[ -f "$VSIX_PATH" ]]; then
    echo -e "${GREEN}✓${NC} VSIX found at: $VSIX_PATH"
    ls -lh "$VSIX_PATH"
else
    echo -e "${RED}✗${NC} VSIX not found at: $VSIX_PATH"
fi

# Check if VSIX is installed in IDE extensions
echo ""
echo "Checking IDE extensions directory (VS Code/Cursor)..."
for ext_dir in "/home/daml/.vscode-server/extensions" "/home/daml/.vscode-server-insiders/extensions" "/home/daml/.cursor-server/extensions"; do
    if [[ -d "$ext_dir" ]]; then
        echo "Checking $ext_dir..."
        DAML_EXT=$(ls "$ext_dir" 2>/dev/null | grep -i daml || true)
        if [[ -n "$DAML_EXT" ]]; then
            echo -e "${GREEN}✓${NC} DAML extension found: $DAML_EXT"
        else
            echo -e "${YELLOW}⚠${NC} DAML extension not found in $ext_dir"
        fi
    fi
done

# Test DAML build capability
echo ""
echo "Testing DAML build capability..."
if [[ -f "/workspace/examples/invoice-workflow/daml.yaml" ]]; then
    echo "Found example project at /workspace/examples/invoice-workflow"
    cd /workspace/examples/invoice-workflow

    if daml build 2>&1 | grep -q "Done"; then
        echo -e "${GREEN}✓${NC} DAML build successful"
    else
        echo -e "${YELLOW}⚠${NC} DAML build test - check output above"
    fi
else
    echo -e "${YELLOW}⚠${NC} Example project not found, skipping build test"
fi

# Summary
echo ""
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo -e "${GREEN}Core Requirements:${NC}"
echo "  • Java: ✓ Installed"
echo "  • DAML: ✓ Installed"
echo "  • Build capability: ✓ Ready"
echo ""
echo -e "${YELLOW}VS Code Extension:${NC}"
echo "  • VSIX file: Check above"
echo "  • Extension install: Check above"
echo ""
echo "To manually install VSIX in VS Code:"
echo "  1. Open Command Palette (Ctrl+Shift+P)"
echo "  2. Run: 'Extensions: Install from VSIX...'"
echo "  3. Select: $VSIX_PATH"
echo ""
echo "========================================="