# devenv-init

`devenv-init` bootstraps a ready-to-use Canton + DAML development environment. It sets up a VS Code devcontainer with the DAML SDK, installs the VSIX automatically, seeds a sample invoice workflow project, and wires the repo root so the DAML language server works on first open.

## Requirements
- [Bun](https://bun.sh) (the CLI is executed via `bunx`)

## Usage

```bash
bunx devenv-init [options]
```

### Options
- `--dir <path>`: Where to scaffold the workspace (defaults to current directory)
- `--force`: Overwrite existing files (otherwise the CLI skips files that already exist)

## What Gets Created

### Always included:
- `.devcontainer/` with a Dockerfile, devcontainer.json, and the `install-daml-vsix.sh` hook that installs the DAML extension on container attach
- `.gitignore` preconfigured for Canton/DAML development artifacts (`.daml/`, `.vscode/`, build outputs, etc.)

### Bring-your-own DAML sources
This starter intentionally **does not** scaffold a sample `daml.yaml` or `daml/` tree. After running the CLI you can:
- run `dpm new .` (or `daml new .` if you prefer the legacy assistant) to create a fresh project, or
- copy an existing Canton/DAML workspace into the generated folder.

After running the CLI:
1. Open the folder in VS Code or Cursor.
2. Reopen in the devcontainer when prompted.
3. Wait for the automatic VSIX install (`install-daml-vsix.sh` runs via `postAttachCommand`).
4. Initialize or copy your DAML sources, then run `dpm build` (or `daml build`) at the repo root to warm up the language server.

## Local Development
Inside this monorepo you can test the CLI without publishing by running:

```bash
bun run packages/canton-devenv-start/bin/index.js --dir /tmp/test-canton-env --force
```

Then inspect `/tmp/test-canton-env` or open it in VS Code to verify the experience.
