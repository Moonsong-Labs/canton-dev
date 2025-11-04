# Canton DAML Development

## Requirements
- Docker Desktop
- VS Code or Cursor IDE

## Setup

### VS Code/Cursor (Recommended)
1. Install "Remote - Containers" extension
2. Open folder → Reopen in Container

### Command Line
```bash
make dev-build   # Build container
make dev-shell   # Open shell
make build       # Build DAML
make test        # Run tests
make verify      # Verify setup
```

### Inside Container
```bash
# After running: make dev-shell
cd examples/invoice-workflow
daml build       # Compile DAML code
daml start       # Start DAML sandbox
```

## Project Structure
```
.devcontainer/    # Container config
examples/         # DAML samples
Makefile          # All commands
```

## Troubleshooting

**DAML extension not loading:**
- Command Palette → "Extensions: Install from VSIX..."
- Select `/home/daml/daml-bundled.vsix`

**Container rebuild:**
```bash
make dev-rebuild
```

