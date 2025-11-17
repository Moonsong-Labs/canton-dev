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
- `.devcontainer/` with Dockerfile, devcontainer.json, `install-daml-vsix.sh`
- `.gitignore` tuned for DAML artifacts
- Empty workspace ready for `dpm new .`

Open the folder in VS Code/Cursor, “Reopen in Container,” and run `dpm build` once to warm the language server.

## Local development
1. From repo root: `bunx --bun link` (aka `bun link`).
2. In any test workspace: `bun link canton-devenv-start`.
3. Run the CLI there: `bunx devenv-init --dir /tmp/test-canton-env --force`.
