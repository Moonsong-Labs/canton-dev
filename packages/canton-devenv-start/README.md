# canton-devenv-start

Scaffold a Canton + DAML development environment with devcontainer, multi-SDK support, and AI-assisted SDK generation.

## Quick Start
```bash
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0
```

## Usage
```bash
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#<version> [options]
```
| Option | Description |
|--------|-------------|
| `--dir <path>` | Target folder (defaults to cwd) |
| `--force` | Overwrite existing files |

## What's Included

### Devcontainer Setup
Pre-configured Docker environment for Canton/DAML development. Eliminates manual SDK installation, version management, and toolchain setup—open the folder and start coding.

**Includes:**
- DAML SDK + Canton runtime
- Language server with IDE support
- Pre-configured ports for local Canton nodes
- Choice of SDK versions (latest 3.x or stable 2.x)

**Files:**
- **Dockerfile** - Shared base with DAML SDK + tooling
- **latest/** - SDK 3.x (Canton 3.4.8)
- **stable/** - SDK 2.x
- **install-daml-vsix.sh** - Auto-installs DAML IDE extension
- **daml-lsp-restart.sh** - Language server helper

### Claude Code Integration
**Problem:** DAML's `codegen js` produces verbose, deeply-nested TypeScript with package hashes and complex type paths—difficult to use directly in applications.

**Solution:** AI-assisted SDK generation via slash command:

```bash
/project:generate-api
```

Transforms raw Daml JS bindings → clean, documented TypeScript API:
- Parses `daml.yaml` / `multi-package.yaml` projects
- Runs `daml build` + `daml codegen js`
- Generates type-safe SDK with workflows (CreateAccount, Transfer, DvP, etc.)
- Produces test suite with Vitest

**Output structure:**
```
sdk/
├── core/
│   ├── primitives.ts   # Party, ContractId, Time, etc.
│   ├── interfaces.ts   # AccountKey, InstrumentKey, Quantity, etc.
│   └── index.ts
├── <project>-api.ts    # Workflows + TypeGuards + MockFactories
└── __tests__/
    └── <project>-api.test.ts
```

## Getting Started
1. Run scaffold command
2. Open in VS Code/Cursor
3. "Reopen in Container" → choose **latest** or **stable**
4. (Optional) Run `/project:generate-api` to generate TypeScript SDK

## Forwarded Ports
`5011` `5012` `5021` `5022` `5018` `5019` `7500` `7575`

## Local Development
```bash
# From repo root
bunx --bun link

# In test workspace
bun link canton-devenv-start
bunx devenv-init --dir /tmp/test-canton-env --force
```
