# Canton JetBrains Plugin

DAML language support for JetBrains IDEs (IntelliJ IDEA Community/Ultimate, WebStorm, PyCharm, GoLand, RustRover, ...). Wraps the official DAML language server (`daml damlc ide` / `dpm damlc ide`) via [LSP4IJ](https://github.com/redhat-developer/lsp4ij).

## Status

v0.1 — local-install beta. Builds a `.zip` artifact suitable for **Settings → Plugins → ⚙ → Install Plugin from Disk…**. No Marketplace publishing yet.

## Super Quick Start

Use this path when you want to test the plugin in your local JetBrains IDE with a local DAML SDK.

1. Install a JetBrains IDE and the LSP4IJ plugin.
2. Install DAML SDK `3.4.11` locally, or confirm it already exists:

   ```bash
   daml install 3.4.11
   /Users/eze/.daml/sdk/3.4.11/daml/daml version
   ```

3. Build the plugin zip:

   ```bash
   cd packages/canton-jetbrains-plugin
   ./gradlew buildPlugin
   ```

4. Install `build/distributions/canton-jetbrains-plugin-0.1.0.zip` via **Settings → Plugins → ⚙ → Install Plugin from Disk…**.
5. Restart the IDE if prompted.
6. Open your DAML/Canton project folder.
7. Run **Tools → Validate Canton/DAML Runtime**. A local runtime is OK; devcontainer is optional.
8. Open a `.daml` file and confirm highlighting, diagnostics, hover, completion, and go-to-definition.
9. Run a generated run configuration:
    - `DAML Build` from `daml.yaml` or `multi-package.yaml`
    - `DAML Script` from a `.daml` file with a script declaration
    - `Canton Config` from a `.conf` file
    - `Canton Script` from a `.canton` or `.canton.sc` file

Optional devcontainer path:

1. Install Docker and use a JetBrains IDE with Dev Containers support.
2. Run **Tools → Prepare Canton/DAML Devcontainer**.
3. Reopen the project using JetBrains Dev Containers and pick the generated `.devcontainer/devcontainer.json`.
4. Run **Tools → Validate Canton/DAML Runtime**.
5. Enable **Require Canton/DAML devcontainer runtime for run configurations** only if you want run configs to refuse local execution.

Expected success signals:

- LSP4IJ shows the DAML Language Server as running.
- `.daml` files show diagnostics and hover tooltips.
- Clicking a DAML `Script results` code lens, or running **Tools → Show DAML Script Results** from a `.daml` file, opens the **DAML Script Results** tool window.
- In table view, **Show detailed disclosure** expands party visibility from `X` into `S` signatory, `O` observer, `W` witness, and `D` divulgence markers.
- The Run tool window shows DAML/Canton command output and exit status.

## Features

- Syntax highlighting for `.daml` files via a native lexer; LSP semantic tokens layer on top once the server responds
- Diagnostics, hover, go-to-definition, completion, document symbols, rename — all via the official DAML LSP
- Local fallback navigation for DAML imports, so Ctrl/Cmd-click on `import Some.Module.Name` opens the matching `module`, and explicit import-list symbols like `import Some.Module (Thing)` jump to the local `Thing` declaration when available
- DAML's signature **Script Results** panel (rendered in a JCEF webview, mirroring the VSCode experience)
- `daml.yaml` and `multi-package.yaml` JSON-schema completion
- DAML run configurations for build, test, script, and start
- Canton config/script highlighting and run configurations for `.conf`, `.canton`, and `.canton.sc`
- Bundled Canton/DAML devcontainer template for reproducible local beta testing
- Live templates (`template`, `choice`, `signatory`, `script`, …)
- Per-project settings: devcontainer profile, runtime validation, DAML/DPM/Canton binary paths, log level, telemetry, extra args, multi-package mode
- DAML LSP currently uses stable single-package `damlc ide`; root `multi-package.yaml` projects fall back to the active or first nested `daml.yaml` package workspace.
- The upstream DAML TextMate grammar is bundled at `resources/grammars/daml.tmLanguage.xml` for users who want to register it manually via **Settings → Editor → TextMate Bundles** (not auto-registered)

## Prerequisites

- A JetBrains IDE on **2025.2** or newer
- Docker, only if you use the bundled devcontainer
- The DAML SDK/Canton runtime installed in the active IDE backend (`daml --version` and `canton --help` should work there)
- The [LSP4IJ plugin](https://plugins.jetbrains.com/plugin/23257-lsp4ij) installed in your IDE (it is a runtime dependency; the IDE will offer to install it when you load this plugin)

## Quickstart — building and testing locally

The Gradle wrapper is committed; you only need a JDK 21 on your PATH. The wrapper will fetch Gradle 9.2.1 on first run.

```bash
cd packages/canton-jetbrains-plugin

# Verify your toolchain (JDK 21 required by IntelliJ Platform 2025.2).
java -version            # should report 21.x

# Build the plugin distribution.
./gradlew buildPlugin
# Artifact: build/distributions/canton-jetbrains-plugin-<version>.zip

# Fast iteration: launch a sandbox IntelliJ IDEA Community with the plugin pre-installed.
./gradlew runIde

# Optional: run the JetBrains plugin verifier before packaging.
./gradlew verifyPlugin
```

If `./gradlew` complains about the JDK, install via [SDKMAN](https://sdkman.io/) (`sdk install java 21-tem`) or download from [Temurin](https://adoptium.net/).

To install in your real IDE:
1. Run `./gradlew buildPlugin`.
2. In your IDE: **Settings → Plugins → ⚙ → Install Plugin from Disk…**
3. Pick `build/distributions/canton-jetbrains-plugin-<version>.zip`.
4. Restart when prompted.
5. Open any folder containing a `daml.yaml` or `multi-package.yaml`. The plugin activates automatically.

## Verify it's working

- Open a `.daml` file → DAML icon and language tag in the editor tab; keywords highlighted.
- Status bar: "DAML Language Server: Running" (LSP4IJ surface).
- Introduce a type error → red squiggle within ~2 s.
- Hover any identifier → inferred type tooltip.
- `Cmd/Ctrl+Click` an identifier → jumps to definition.
- File with a `script` decl → "Script results" code lens if Code Vision is enabled, or the run gutter icon next to the script name; click it, or use **Tools → Show DAML Script Results** → bottom **DAML Script Results** tool window opens and refreshes as the script reruns.

## Common first-run issues

| Symptom | Fix |
|---|---|
| Plugin zip not found | Run `./gradlew buildPlugin`; install `build/distributions/canton-jetbrains-plugin-0.1.0.zip`. |
| LSP4IJ missing | Install the LSP4IJ plugin from JetBrains Marketplace, then restart the IDE. |
| "Not running inside the Canton/DAML devcontainer" | This only blocks run configurations when **Require Canton/DAML devcontainer runtime for run configurations** is enabled. Disable it for local SDK testing, or reopen the project with JetBrains Dev Containers. |
| `Unable to start language server: ProcessStreamConnectionProvider ... ~/.daml/bin/daml ... multi-ide` | Reinstall the latest plugin zip. For host testing, the plugin now prefers the pinned SDK assistant, for example `~/.daml/sdk/3.4.11/daml/daml`, over stale `~/.daml/bin/daml` symlinks. |
| `Unable to start language server ... damlc multi-ide ...` | Reinstall the latest plugin zip. The beta now avoids `damlc multi-ide` for LSP startup and uses stable `damlc ide` from a nested package workspace. |
| "DAML SDK not found" | Confirm `daml` or `dpm` is on the active backend PATH, or set the binary path in **Settings → Languages & Frameworks → DAML**. |
| "Canton not found" | Confirm `canton` is on the active backend PATH, or set the Canton binary path in settings. |
| "No daml.yaml found" | Open a project containing `daml.yaml` / `multi-package.yaml`; nested DAML packages are discovered automatically. |
| Script Results panel says "JCEF not available" | On Linux, **Help → Find Action → Choose Boot Java Runtime for the IDE → install with JCEF**. |
| Need logs | Check **Help → Show Log in Finder/Explorer**, the Run tool window, and `build/reports/pluginVerifier` after `./gradlew verifyPlugin`. |

## Development

```bash
./gradlew runIde       # sandbox IDE for fast iteration
./gradlew verifyPlugin # JetBrains plugin verifier (run before packaging)
./gradlew buildPlugin  # produces the installable .zip
```

## CI And Releases

- Pull requests touching `packages/canton-jetbrains-plugin/**` run `.github/workflows/test-jetbrains-plugin.yml`, which executes `./gradlew test buildPlugin` and uploads the zip as a CI artifact.
- Versioned plugin releases use `.github/workflows/release-jetbrains-plugin.yml`.
- To release from GitHub Actions, run **Release JetBrains Plugin** manually with a version like `0.1.0`.
- To release from git, push a tag like `canton-jetbrains-plugin-v0.1.0`.
- The workflow creates or updates a GitHub Release and attaches `canton-jetbrains-plugin-<version>.zip` plus a `.sha256` checksum.

## License

Apache 2.0. Includes assets ported from [`digital-asset/daml`](https://github.com/digital-asset/daml) (also Apache 2.0).
