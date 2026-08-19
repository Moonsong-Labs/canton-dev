# 🏛️ canton-dev

Tooling that removes the setup tax from Canton and DAML development.

This repository ships **`canton-devenv-start`**, a zero dependency Node CLI that scaffolds a ready to
use Canton + DAML workspace: a reproducible devcontainer with the DAML SDK and Canton runtime already
installed, plus a set of Claude Code skills that turn DAML contracts into a typed TypeScript SDK,
integration tests, a React webapp, and workflow diagrams.

One command, and you go from an empty folder to writing DAML instead of installing toolchains.

```bash
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0
```

---

## 🧠 The skills

The skills are the heart of this repo. They land in `.claude/skills/` in the generated workspace and
are invoked from plain language, so there are no commands to memorize.

| Skill | What it does | Say something like |
|-------|--------------|--------------------|
| 🏗️ `canton-sdk-generator` | Discovers DAML projects, builds them, runs `codegen js`, then generates a clean typed API plus React hooks and Vitest scaffolding, and type checks the result. | *"Generate a TypeScript API from my DAML contracts"* |
| 🧪 `canton-test-generator` | Reads `daml/Scripts/tests/`, replicates `Setup.daml` through the SDK, and writes TypeScript integration tests that mirror your DAML scripts. Needs the SDK first. | *"Generate tests for my Canton project"* |
| 🖥️ `canton-webapp-generator` | Scaffolds a React 18 + Vite + TanStack Query + Tailwind app, then wires a hook and a UI control for **every** template and **every** choice found in the SDK. No placeholders allowed. | *"Create a webapp for this ledger app"* |
| 📊 `daml-diagrams` | Themed PlantUML activity diagrams for choice flows and multi party workflows, with swim lanes per party and the renderer pitfalls already handled. | *"Diagram this DAML choice flow"* |
| ⚖️ `daml-on-ledger-decision` | Walks the authority, audit, shared input, atomicity, and privacy tests, then pushes you toward the smallest on ledger commitment that passes. | *"Should this validation be a DAML choice or backend logic?"* |

### 🏗️ canton-sdk-generator

`daml codegen js` emits deeply nested TypeScript keyed by package hashes. It is technically complete
and painful to write applications against. This skill parses those bindings into a flat, typed API:
one namespace per template with `Payload`, `create()`, and a function per choice, plus query helpers,
type guards, mock factories, retry and error classes, and a React layer (context, typed query and
mutation hooks, and query key factories so cache invalidation actually works).

The generator behind it (`scripts/generate-canton-api.ts`, ~3.4k lines) classifies templates by
**structure rather than naming convention**, through a DAML agnostic intermediate representation, so
it does not care what you named things.

```
sdk/
├── core/
│   ├── primitives.ts   # Party, ContractId, Time, ...
│   ├── interfaces.ts   # AccountKey, InstrumentKey, Quantity, ...
│   └── index.ts
├── <project>-api.ts    # Workflows + TypeGuards + MockFactories
├── react/              # Context, hooks, query keys
└── __tests__/
```

### 🧪 canton-test-generator

Reads your DAML test scripts and produces TypeScript integration tests that exercise the same
workflows through the generated SDK. It follows a convention: if `daml/Scripts/Setup.daml` exists, it
is treated as ledger setup (party allocation, initial contracts, configuration) and replicated into a
`testSetup.ts` that creates the same contracts with the **actual values** from your DAML, not invented
ones. If no scripts exist, the skill tells you so and stops instead of fabricating tests.

### 🖥️ canton-webapp-generator

Scaffolds a working React app, then reads the SDK to discover every template and every choice, and
requires a hook and a wired control for each one. The skill has an explicit no placeholder rule and a
completion checklist: no TODO comments, no "coming soon" components, no buttons that do nothing.

### 📊 daml-diagrams

Encodes the mapping from DAML semantics to diagram elements: parties become swim lanes, each
`exercise` becomes an activity, `create` and `archive` get their own steps. It knows the subtle rules
too, for example that conjunctive choices render as a single atomic activity and never as a `fork`,
and it carries the sync anchor workaround for PlantUML's fork bars not crossing swim lanes. Ships with
a themed template, a render script, and four reference documents.

### ⚖️ daml-on-ledger-decision

A decision framework rather than a generator. It starts from one question, "why does this belong on
the ledger?", and defaults to **off** ledger until a specific test says otherwise. It names the five
things only a Canton style ledger provides (authorization, non repudiation, cross party atomicity,
encoded privacy, shared state) and pushes back on the habitual reasons teams put things on chain.

---

## 📦 What the CLI scaffolds

| Path | What it is |
|------|-----------|
| `packages/canton-devenv-start/bin/index.js` | The whole CLI. Recursive template copy, path traversal guard, permission preserving, skip unless `--force`. No runtime dependencies. |
| `templates/.devcontainer/` | Two devcontainer variants sharing a base image, plus IDE helper scripts. |
| `templates/.claude/skills/` | The five skills above. |
| `.github/workflows/release.yml` | On a `v*` release: stamps the version, runs `npm pack`, attaches the tarball. |
| `.github/workflows/test-devcontainers.yml` | On PRs touching `.devcontainer/`: builds both image variants using config read from `devcontainer.json`. |

Two environment variants are maintained side by side, both verified in CI:

| Variant | DAML SDK | Extras |
|---------|----------|--------|
| 🟢 `stable` | 2.10.2 | Shared base image: JDK 17, Node 22, Bun, TypeScript, Vitest |
| 🔵 `latest` | 3.4.9 | Adds the `dpm` CLI, `oras`, `yq`, and a pre built DAML Finance at a pinned commit, so the DARs are ready on first boot |

Both forward the Canton ledger, admin, and JSON API ports (`5011`, `5012`, `5018`, `5019`, `5021`,
`5022`, `7500`, `7575`), auto install the bundled DAML VS Code extension on attach, and run as a non
root `daml` user. The SDK version is a required build arg, so the image fails loudly rather than
silently drifting.

---

## ✨ What is original here

Plenty of this stack comes from upstream, and it is worth being precise about the split.

**Vendored from Digital Asset:** the DAML SDK (pulled from `digital-asset/daml` releases), DAML
Finance (built from source at a pinned commit), the `dpm` CLI (pulled from DA's OCI registry), the
bundled DAML VS Code extension, and `daml build` / `daml codegen js` themselves.

**Built here:**

- 🐳 **A devcontainer path at all.** DA's official [`cn-quickstart`](https://github.com/digital-asset/cn-quickstart)
  is a Nix and direnv reference application you clone and modify, with a Gradle backend, Docker Compose
  topology, and observability stack. This repo takes the opposite approach: a scaffolder that drops a
  pinned Docker environment into *your* project, with nothing to clone and nothing to strip out.
- 🔌 **`install-daml-vsix.sh`.** Locates the bundled extension across dpm cache and SDK layouts, then
  finds whichever remote CLI is present (VS Code, VS Code Insiders, Cursor, or the raw remote CLI) and
  installs it. This is the kind of glue that quietly eats an afternoon.
- 💰 **DAML Finance pre built for 3.x.** The `latest` image builds it through `dpm` from a pinned
  commit on the 3.x upgrade branch, so it is ready at first boot rather than a manual step.
- 🤖 **All five skills.** Nothing upstream flattens codegen output into an ergonomic API, generates
  tests from DAML scripts, generates a fully wired webapp, encodes DAML to PlantUML conventions, or
  formalizes the on ledger versus off ledger decision.
- 📌 **Relevant for 3.x specifically:** DA's official `@daml/react`, `@daml/ledger`, and `@daml/types`
  npm packages are published for the 2.x line only (latest is 2.10.6). If you are on SDK 3.x, there is
  no official React binding to reach for, which is exactly the gap the generated SDK fills.
- ⚙️ **CI that reads its own config.** `test-devcontainers.yml` pulls `DAML_SDK_VERSION`, `dockerfile`,
  and `context` straight out of each `devcontainer.json`, so bumping the SDK needs no workflow edit.

---

## 🚀 Getting started

```bash
# Scaffold into the current folder
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0

# Or into a specific folder, overwriting existing files
npx git+ssh://git@github.com/Moonsong-Labs/canton-dev.git#v1.0.0 --dir ./my-app --force
```

| Option | Description |
|--------|-------------|
| `--dir`, `--path <path>` | Output directory (defaults to the current directory) |
| `--force`, `-f` | Overwrite files that already exist |
| `--help`, `-h` | Show usage |

Then:

1. 📂 Open the folder in VS Code or Cursor.
2. 🐳 **Reopen in Container**, choosing `latest` (SDK 3.x) or `stable` (SDK 2.x).
3. 🔨 Run `daml build` at the root to warm up the language server.
4. 💬 Ask Claude for whatever comes next, for example *"Generate a TypeScript API from my DAML contracts"*.

A typical loop: write your templates, ask `daml-on-ledger-decision` where the logic belongs, generate
the SDK, generate tests, run them against the ledger, generate the webapp, and diagram the flow for
your docs.

---

## 🛠️ Local development

```bash
cd packages/canton-devenv-start
bun link

# In a scratch workspace
bunx canton-devenv-start
```

The CLI is plain CommonJS with no dependencies, so `node bin/index.js --dir /tmp/scratch` works
directly for a quick check.

### 📦 Releasing

Create a GitHub release tagged `vX.Y.Z`. The release workflow stamps `X.Y.Z` into the package version,
runs `npm pack`, and attaches `devenv-<version>.tgz` to the release. Consumers install through the
`git+ssh` URL pinned to that tag.

### 🔧 Changing the devcontainer

Bump `DAML_SDK_VERSION` in the relevant `devcontainer.json` and open a PR. CI picks it up and builds
both variants without any workflow change.

---

## 📄 License

MIT. See `packages/canton-devenv-start/package.json`.
