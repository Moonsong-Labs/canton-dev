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

**Using Cursor instead of VS Code:**
- The devcontainer works with both VS Code and Cursor.
- If you run `daml studio` on a machine without VS Code, create a temporary alias so Daml can launch Cursor instead:
```bash
alias code=cursor
```
- Then run `daml studio` again in that terminal.

**Container rebuild / persistence:**
- Devcontainers are **persistent by default**. Close/reopen the IDE and choose **"Reopen in Container"** to reattach to the existing container without rebuilding.
- Only trigger a full rebuild when you actually want a fresh image:
```bash
make dev-rebuild
```

### Local Canton Network (Localnet)

### Run the localnet
```bash
# Inside the devcontainer
make localnet
# In the Canton console, connect participants and verify
p1.domains.connect_local(local)
p2.domains.connect_local(local)
health.status
```

### Deploy a DAML contract to the localnet
```bash
# Build a DAR (example: invoice-workflow)
cd examples/invoice-workflow && daml build && cd -

# Upload DAR (and optionally run a setup script)
# Example: make deploy DAR=examples/invoice-workflow/.daml/dist/invoice-workflow-0.0.1.dar SCRIPT=Main:setup
make deploy DAR=path/to/your.dar [SCRIPT=Module:setup]
```

### Interact with the ledger
- GUI (Daml Navigator)
```bash
# Start Navigator against p1 (defaults: NAV_PORT=7500, LEDGER_PORT=5011)
make nav [NAV_PORT=7500] [LEDGER_HOST=localhost] [LEDGER_PORT=5011]
# Open http://localhost:7500 (or your chosen NAV_PORT)
```

- JSON API (optional)
```bash
# Start JSON API against p1 (defaults: HTTP_PORT=7575, LEDGER_PORT=5011)
make json-api [HTTP_PORT=7575] [LEDGER_HOST=localhost] [LEDGER_PORT=5011]

# Example: list active Main.Invoice contracts
curl -s -X POST http://localhost:7575/v1/query \
  -H "Content-type: application/json" \
  -d '{"templateIds":["Main.Invoice"],"query":{}}'
```
