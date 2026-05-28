# Canton JetBrains Plugin

DAML language support for JetBrains IDEs (IntelliJ IDEA Community/Ultimate, WebStorm, PyCharm, GoLand, RustRover, ...). Wraps the official DAML language server (`daml damlc ide` / `dpm damlc ide`) via [LSP4IJ](https://github.com/redhat-developer/lsp4ij).

## Status

v0.3 — local-install beta. Builds a `.zip` artifact suitable for **Settings → Plugins → ⚙ → Install Plugin from Disk…**. No Marketplace publishing yet.

## Super Quick Start

Use this path when you want to test the plugin in your local JetBrains IDE with the local DAML/DPM runtime.

1. Install a JetBrains IDE, such as RustRover or IntelliJ IDEA, and the LSP4IJ plugin.
2. Install `dpm` or the DAML assistant if neither exists yet:

   ```bash
   # Preferred for DAML SDK 3.4.x
   curl -sSL https://get.digitalasset.com/install/install.sh | sh -s

   # Older assistant path, still supported by the plugin
   curl -sSL https://get.daml.com/ | sh
   ```

3. Build the plugin zip:

   ```bash
   cd packages/canton-jetbrains-plugin
   ./gradlew buildPlugin
   ```

4. Install `build/distributions/canton-jetbrains-plugin-0.3.0.zip` in your IDE:
   - Open **Settings / Preferences → Plugins**.
   - Click the gear icon.
   - Choose **Install Plugin from Disk…**.
   - Select the plugin zip.
5. Restart the IDE if prompted.
6. Open your DAML/Canton project folder.
7. Open **Settings → Languages & Frameworks → DAML**.
   Click **Install DPM CLI** if `dpm` is not installed, then choose DAML SDK `3.4.11` and click **Install selected SDK** if that SDK is not installed yet.
8. Run **Tools → Validate Canton/DAML Runtime**.
9. Open a `.daml` file and confirm highlighting, diagnostics, hover, completion, and go-to-definition.
10. Run a generated run configuration:
    - `DAML Build` from `daml.yaml` or `multi-package.yaml`
    - `DAML Script` from a `.daml` file with a script declaration
    - `Canton Config` from a `.conf` file
    - `Canton Script` from a `.canton` or `.canton.sc` file

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
- Live templates (`template`, `choice`, `signatory`, `script`, …)
- Per-project settings: DAML SDK version installer, runtime validation, DAML/DPM/Canton binary paths, log level, telemetry, extra args, multi-package mode
- DAML LSP currently uses stable single-package `damlc ide`; root `multi-package.yaml` projects fall back to the active or first nested `daml.yaml` package workspace.

## Prerequisites

- A JetBrains IDE on **2025.2** or newer
- `dpm` or the DAML assistant installed locally. The plugin can install SDK `3.4.11` from there.
- Canton installed locally if you want Canton run configurations (`canton --help` should work, or set the Canton binary override)
- The [LSP4IJ plugin](https://plugins.jetbrains.com/plugin/23257-lsp4ij) installed in your IDE (it is a runtime dependency; the IDE will offer to install it when you load this plugin)

## Install In A JetBrains IDE

There are two supported beta install paths:

- Local build: build the zip from this repository.
- Release download: download a versioned zip from the GitHub Release when one exists.

To install a locally built zip:

1. Build the plugin:

   ```bash
   cd packages/canton-jetbrains-plugin
   ./gradlew buildPlugin
   ```

2. Locate the generated zip:

   ```text
   packages/canton-jetbrains-plugin/build/distributions/canton-jetbrains-plugin-<version>.zip
   ```

3. In RustRover, IntelliJ IDEA, or another JetBrains IDE, open **Settings / Preferences → Plugins**.
4. Click the gear icon next to the plugin search field.
5. Choose **Install Plugin from Disk…**.
6. Select the generated `canton-jetbrains-plugin-<version>.zip`.
7. Restart the IDE when prompted.
8. Open a folder containing `daml.yaml` or `multi-package.yaml`.
9. Open **Settings / Preferences → Languages & Frameworks → DAML** and validate or install the local runtime.

Do not unzip the plugin archive before installing it. JetBrains expects the `.zip` file directly.

## Quickstart — Building And Testing Locally

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

After building, install the generated zip through **Settings / Preferences → Plugins → gear icon → Install Plugin from Disk…**. See **Install In A JetBrains IDE** above for the full click path.

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
| `Unable to start language server: ProcessStreamConnectionProvider ... ~/.daml/bin/daml ... multi-ide` | Reinstall the latest plugin zip. For host testing, the plugin now prefers the pinned SDK assistant, for example `~/.daml/sdk/3.4.11/daml/daml`, over stale `~/.daml/bin/daml` symlinks. |
| `Unable to start language server ... damlc multi-ide ...` | Reinstall the latest plugin zip. The beta now avoids `damlc multi-ide` for LSP startup and uses stable `damlc ide` from a nested package workspace. |
| "DAML SDK not found" | Install `dpm` or the DAML assistant first. Then use **Settings → Languages & Frameworks → DAML → Install selected SDK**, or set the binary path override. |
| "Canton not found" | Confirm `canton` is on the active backend PATH, or set the Canton binary path in settings. |
| "No daml.yaml found" | Open a project containing `daml.yaml` / `multi-package.yaml`; nested DAML packages are discovered automatically. |
| Script Results panel says "JCEF not available" | On Linux, **Help → Find Action → Choose Boot Java Runtime for the IDE → install with JCEF**. |
| `dpm` is not found in a new IDE Terminal tab | First confirm DPM is installed. In **Settings → Languages & Frameworks → DAML**, click **Install DPM CLI** if `~/.dpm/bin/dpm` does not exist. Then open a fresh Terminal tab. The plugin prepends `~/.dpm/bin`, `~/.daml/bin`, and `~/.daml/sdk/<version>/daml` through both Terminal process env and JetBrains shell integration, so zsh startup files should not erase it. Existing terminal tabs keep their old environment. |
| Need logs | Check **Help → Show Log in Finder/Explorer**, the Run tool window, and `build/reports/pluginVerifier` after `./gradlew verifyPlugin`. |

## Development

```bash
./gradlew runIde       # sandbox IDE for fast iteration
./gradlew verifyPlugin # JetBrains plugin verifier (run before packaging)
./gradlew buildPlugin  # produces the installable .zip
```

## CI And Releases

- Pull requests touching `packages/canton-jetbrains-plugin/**` run `.github/workflows/test-jetbrains-plugin.yml`, which executes `./gradlew test buildPlugin`.
- Versioned plugin releases use `.github/workflows/release-jetbrains-plugin.yml`.
- To release from GitHub Actions, run **Release JetBrains Plugin** manually with a version like `0.1.0`.
- To release from git, push a tag like `canton-jetbrains-plugin-v0.1.0`.
- The workflow creates or updates a GitHub Release and attaches `canton-jetbrains-plugin-<version>.zip` plus a `.sha256` checksum.

## License

Apache 2.0. Includes assets ported from [`digital-asset/daml`](https://github.com/digital-asset/daml) (also Apache 2.0).
