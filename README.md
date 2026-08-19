# 🏛️ canton-dev

A **containerized environment** packaging the Canton SDK, DAML compiler, and all dependencies for
one-click setup. Plus a set of skills to assist on Canton Development.

The container **supports both stable and latest SDK versions**, allowing teams to test
smart contract compatibility with upcoming releases without disrupting their current development
environment.

## 🚀 Quick start

```bash
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0 [options]
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Target folder (defaults to cwd) |
| `--force` | Overwrite existing files |

Then:

1. Open the scaffolded folder in VS Code or Cursor.
2. **Reopen in Container**, choosing `latest` (SDK 3.x) or `stable` (SDK 2.x).
3. Ask Claude to generate a TypeScript SDK, tests, a webapp, or DAML workflow diagrams.

## 📦 What's included

### Devcontainer

Pre-configured Docker environment for Canton and DAML development. Eliminates manual SDK
installation, version management, and toolchain setup. Open the folder and start coding.

- DAML SDK and Canton runtime
- Language server with IDE support
- Pre-configured ports for local Canton nodes
- Choice of SDK versions (latest 3.x or stable 2.x)

| File | Purpose |
|------|---------|
| `Dockerfile` | Shared base with DAML SDK and tooling |
| `latest/` | SDK 3.x, plus `dpm` and a pre built DAML Finance |
| `stable/` | SDK 2.x |
| `install-daml-vsix.sh` | Auto-installs the DAML IDE extension |
| `daml-lsp-restart.sh` | Language server restarter helper |

### ⭐ What's ours

| Layer | Source |
|-------|--------|
| DAML SDK, `daml build`, `daml codegen js` | Digital Asset |
| DAML Finance, `dpm`, bundled VS Code extension | Digital Asset |
| The devcontainer variants and the scaffolder CLI | **Built here** |
| DAML Finance pre built for SDK 3.x, editor and LSP glue | **Built here** |
| Skills | **Built here** |

### Skills

`daml codegen js` produces verbose, deeply-nested TypeScript with package hashes and complex type
paths, which is difficult to use directly in applications. The skills close that gap and cover the
rest of the workflow around it.

| Skill | What it does | Say something like |
|-------|--------------|--------------------|
| `canton-sdk-generator` | Discovers `daml.yaml` and `multi-package.yaml` projects, runs `daml build` and `codegen js`, flattens the output into a typed API with React hooks, type guards, and mock factories, and adds a Vitest suite. | *"Generate a TypeScript API from my DAML contracts"* |
| `canton-test-generator` | Turns your DAML test scripts into TypeScript integration tests that run through the SDK. | *"Generate tests for my Canton project"* |
| `canton-webapp-generator` | Scaffolds a React and Vite app, wiring a hook and a control for every template and every choice in the SDK. | *"Create a webapp for this ledger app"* |
| `daml-diagrams` | Renders choice flows and multi party workflows as themed PlantUML swim lane diagrams. | *"Diagram this DAML choice flow"* |
| `daml-on-ledger-decision` | Runs the authority, audit, shared input, atomicity, and privacy tests to decide what belongs on ledger. | *"Should this be a DAML choice or backend logic?"* |

They are copied into `.claude/skills/`, so Claude auto-invokes them from natural-language requests.

The SDK generator output:

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

## 🛠️ Development

```bash
cd packages/canton-devenv-start && bun link
bunx canton-devenv-start          # in a test workspace
```

MIT.
