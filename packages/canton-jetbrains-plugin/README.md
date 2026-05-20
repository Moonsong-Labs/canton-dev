# Canton JetBrains Plugin

DAML language support for JetBrains IDEs (IntelliJ IDEA Community/Ultimate, WebStorm, PyCharm, GoLand, RustRover, ...). Wraps the official DAML language server (`daml damlc ide` / `dpm damlc ide`) via [LSP4IJ](https://github.com/redhat-developer/lsp4ij).

## Status

v0.1 — local-install only. Builds a `.zip` artifact suitable for **Settings → Plugins → ⚙ → Install Plugin from Disk…**. No Marketplace publishing yet.

## Features

- Syntax highlighting for `.daml` files via a native lexer; LSP semantic tokens layer on top once the server responds
- Diagnostics, hover, go-to-definition, completion, document symbols, rename — all via the official DAML LSP
- DAML's signature **Script Results** panel (rendered in a JCEF webview, mirroring the VSCode experience)
- `daml.yaml` and `multi-package.yaml` JSON-schema completion
- Live templates (`template`, `choice`, `signatory`, `script`, …)
- Per-project settings: binary path, log level, telemetry, extra args, multi-package mode
- The upstream DAML TextMate grammar is bundled at `resources/grammars/daml.tmLanguage.xml` for users who want to register it manually via **Settings → Editor → TextMate Bundles** (not auto-registered)

## Prerequisites

- A JetBrains IDE on **2025.2** or newer
- The DAML SDK installed locally (`daml --version` should work in your shell)
- The [LSP4IJ plugin](https://plugins.jetbrains.com/plugin/23257-lsp4ij) installed in your IDE (it is a runtime dependency; the IDE will offer to install it when you load this plugin)

## Quickstart — building and testing locally

The Gradle wrapper is committed; you only need a JDK 21 on your PATH. The wrapper will fetch Gradle 9.0.2 on first run.

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
5. Open any folder containing a `daml.yaml`. The plugin activates automatically.

## Verify it's working

- Open a `.daml` file → DAML icon and language tag in the editor tab; keywords highlighted.
- Status bar: "DAML Language Server: Running" (LSP4IJ surface).
- Introduce a type error → red squiggle within ~2 s.
- Hover any identifier → inferred type tooltip.
- `Cmd/Ctrl+Click` an identifier → jumps to definition.
- File with a `script` decl → "Script results" code lens; click → bottom **DAML Script Results** tool window opens.

## Common first-run issues

| Symptom | Fix |
|---|---|
| "DAML SDK not found" | Install the SDK (`curl -sSL https://get.daml.com/ \| sh`) or set the binary path in **Settings → Languages & Frameworks → DAML**. |
| "No daml.yaml found" | Open the *subdirectory* containing `daml.yaml` as the project root. |
| Script Results panel says "JCEF not available" | On Linux, **Help → Find Action → Choose Boot Java Runtime for the IDE → install with JCEF**. |
| LSP4IJ missing | The IDE prompt should offer to install it; otherwise install from the JetBrains Marketplace manually. |

## Development

```bash
./gradlew runIde       # sandbox IDE for fast iteration
./gradlew verifyPlugin # JetBrains plugin verifier (run before packaging)
./gradlew buildPlugin  # produces the installable .zip
```

## License

Apache 2.0. Includes assets ported from [`digital-asset/daml`](https://github.com/digital-asset/daml) (also Apache 2.0).
