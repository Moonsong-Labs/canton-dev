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
- **latest/** - SDK 3.x
- **stable/** - SDK 2.x
- **install-daml-vsix.sh** - Auto-installs DAML IDE extension
- **daml-lsp-restart.sh** - Language server restarter helper

### Claude Code Integration
The scaffold includes Claude skills for common Canton/Daml development tasks. They are copied into `.claude/skills/` so Claude can auto-invoke them from natural-language requests in the generated workspace.

#### Canton SDK Generation
**Problem:** DAML's `codegen js` produces verbose, deeply-nested TypeScript with package hashes and complex type paths—difficult to use directly in applications.

**Solution:** AI-assisted SDK generation via Skill (auto-invoked when you mention "generate canton SDK"):

```
Generate a TypeScript API from my Daml contracts
```

Claude automatically:
- Discovers `daml.yaml` / `multi-package.yaml` projects
- Runs `daml build` + `daml codegen js`
- Generates type-safe SDK
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

#### Included Claude Skills
| Skill | What it helps with | Example request |
|-------|--------------------|-----------------|
| `canton-sdk-generator` | Generates a clean TypeScript API from Daml contracts, including workflows, type guards, mock factories, and Vitest coverage. | `Generate a TypeScript API from my Daml contracts` |
| `canton-test-generator` | Generates TypeScript integration tests from Daml scripts using the generated SDK. | `Generate tests for my Canton project` |
| `canton-webapp-generator` | Generates a React/Vite webapp wired to a Canton ledger and the generated SDK. | `Create a webapp for this ledger app` |
| `daml-diagrams` | Designs and renders themed PlantUML activity diagrams for Daml choices, exercise flows, and multi-party workflows. | `Diagram this Daml choice flow` |
| `daml-on-ledger-decision` | Helps decide whether logic belongs on-ledger in Daml or off-ledger in a backend, with a bias toward small on-ledger commitments. | `Should this validation be a Daml choice or backend logic?` |

**Skill location:** `.claude/skills/`

## Getting Started
1. Run scaffold command
2. Open in VS Code/Cursor
3. "Reopen in Container" → choose **latest** or **stable**
4. (Optional) Ask Claude to generate a TypeScript SDK, tests, a webapp, Daml workflow diagrams, or on-/off-ledger design guidance

## Local Development
```bash
# From package directory
cd packages/canton-devenv-start
bun link

# In test workspace
bunx canton-devenv-start
```
