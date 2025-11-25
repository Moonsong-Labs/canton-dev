# devenv-init

Spin up a Canton + DAML workspace with a VS Code devcontainer and bundled DAML SDK in one command.

## Requirements
- [Bun](https://bun.sh) (run via `bunx`)

## Usage
```bash
bunx devenv-init [options]
```
- `--dir <path>` target folder (defaults to cwd)
- `--force` overwrite existing files

## Output
- `.devcontainer/` with:
  - `Dockerfile` (shared)
  - `latest/devcontainer.json` (SDK 3.x)
  - `stable/devcontainer.json` (SDK 2.x)
  - `install-daml-vsix.sh`
- `.gitignore` tuned for DAML artifacts

## Getting Started
1. Open folder in VS Code/Cursor
2. "Reopen in Container" → choose **latest** or **stable**

## Local development
1. From repo root: `bunx --bun link` (aka `bun link`).
2. In any test workspace: `bun link canton-devenv-start`.
3. Run the CLI there: `bunx devenv-init --dir /tmp/test-canton-env --force`.
