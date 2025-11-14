# canton-devenv-start

`canton-devenv-start` bootstraps a ready-to-use Canton + DAML development environment. It sets up a VS Code devcontainer with the DAML SDK, installs the VSIX automatically, seeds a sample invoice workflow project, and wires the repo root so the DAML language server works on first open.

## Usage

```bash
npx canton-devenv-start [options]
```

### Options
- `--dir <path>`: Where to scaffold the workspace (defaults to current directory)
- `--force`: Overwrite existing files (otherwise the CLI skips files that already exist)

## What Gets Created
- `.devcontainer/` with Dockerfile, devcontainer.json, and a VSIX install hook
- Root `daml.yaml` plus `daml/Examples.daml` with the no-op script and imports
- `examples/invoice-workflow` sample demonstrating token + invoice workflow
- `verify-setup.sh` health-check script and the project `README.md`

After running the CLI:
1. Open the folder in VS Code or Cursor
2. Reopen in container (or `Dev Containers: Reopen in Container`)
3. Wait for the DAML extension installation (handled by `postAttachCommand`)
4. Run `daml build` at the repo root to keep CodeLens/LSP in sync

## Local Development
Inside this monorepo you can test the CLI without publishing by running:

```bash
node packages/canton-devenv-start/bin/index.js --dir /tmp/test-canton-env --force
```

Then inspect `/tmp/test-canton-env` or open it in VS Code to verify the experience.
