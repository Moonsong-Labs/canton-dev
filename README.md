# 🏛️ canton-dev

Canton dev provides a one command way to get the DAML toolchain running in a pinned container inside
your project, plus the skills that turn your contracts into application code.

```bash
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0
```

Open the folder in VS Code or Cursor, **Reopen in Container**, and start writing DAML.

---

## ⭐ What this repo adds

| Layer | Source |
|-------|--------|
| DAML SDK, `daml build`, `daml codegen js` | Digital Asset |
| DAML Finance, `dpm`, bundled VS Code extension | Digital Asset |
| The five Claude Code skills | **Built here** |
| The devcontainer variants and the scaffolder CLI | **Built here** |
| DAML Finance pre built for SDK 3.x, editor and LSP glue | **Built here** |

Two things make that worth doing:

- DA's official [`cn-quickstart`](https://github.com/digital-asset/cn-quickstart) is a Nix and direnv
  reference application you clone and strip down. This is a scaffolder that drops a pinned environment
  into a project you already have.
- DA's `@daml/react`, `@daml/ledger`, and `@daml/types` packages stop at the 2.x line (latest 2.10.6).
  On SDK 3.x there is no official React binding, which is what the generated SDK provides.

## 🧠 The skills

Copied into `.claude/skills/`, invoked from plain language, no commands to memorize.

| Skill | What it does | Say something like |
|-------|--------------|--------------------|
| `canton-sdk-generator` | Builds your project, runs `codegen js`, and flattens the output into a typed API with React hooks, type guards, and mock factories. | *"Generate a TypeScript API from my DAML contracts"* |
| `canton-test-generator` | Turns your DAML test scripts into TypeScript integration tests that run through the SDK. | *"Generate tests for my Canton project"* |
| `canton-webapp-generator` | Scaffolds a React and Vite app, wiring a hook and a control for every template and every choice in the SDK. | *"Create a webapp for this ledger app"* |
| `daml-diagrams` | Renders choice flows and multi party workflows as themed PlantUML swim lane diagrams. | *"Diagram this DAML choice flow"* |
| `daml-on-ledger-decision` | Runs the authority, audit, shared input, atomicity, and privacy tests to decide what belongs on ledger. | *"Should this be a DAML choice or backend logic?"* |

`canton-sdk-generator` is the flagship. `daml codegen js` emits deeply nested TypeScript keyed by
package hashes, which is complete and painful to build against. The generator classifies templates by
structure rather than naming convention, so it does not care what you called things.

## 🐳 The environment

| Variant | DAML SDK | Extras |
|---------|----------|--------|
| `stable` | 2.10.2 | JDK 17, Node 22, Bun, TypeScript, Vitest |
| `latest` | 3.4.9 | Adds `dpm`, `oras`, `yq`, and a pre built DAML Finance |

Both forward the Canton ledger, admin, and JSON API ports, auto install the DAML VS Code extension on
attach, and run as a non root user. The SDK version is a required build arg, so the image fails loudly
instead of drifting. CI builds both variants on every PR that touches `.devcontainer/`, reading the
version straight out of `devcontainer.json`.

## 🛠️ Development

CLI usage and scaffolding details: [`packages/canton-devenv-start`](packages/canton-devenv-start/README.md).

```bash
cd packages/canton-devenv-start && bun link
bunx canton-devenv-start          # in a scratch workspace
```

To release, create a GitHub release tagged `vX.Y.Z`. CI stamps the version, packs the tarball, and
attaches it.

MIT.
