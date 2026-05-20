# canton-dev JetBrains devcontainer

Self-contained dev container for working on (and testing) the DAML JetBrains plugin without installing JDK 21, Gradle, or the DAML SDK on your host.

## What you need on your host

- **Docker Desktop** (or any OCI runtime that JetBrains Gateway/Toolbox supports — OrbStack and Rancher Desktop work).
- One of:
  - **JetBrains Gateway** (current entry point) — free download from [jetbrains.com/remote-development/gateway](https://www.jetbrains.com/remote-development/gateway/).
  - **JetBrains Toolbox App** with the **Dev Containers** plugin (the future entry point — Gateway is being migrated into Toolbox).

That's it. No JDK, no Gradle, no `daml` SDK on the host.

## What's inside

| Component | Where it comes from |
|---|---|
| IntelliJ IDEA Community **backend** | Downloaded on first connect by Gateway/Toolbox to `~/.cache/JetBrains/RemoteDev/dist/` of the container user. ~700 MB, one-time per backend version. |
| **LSP4IJ** plugin | Auto-installed from JetBrains Marketplace via `customizations.jetbrains.plugins`. |
| **DAML** plugin (this repo's `packages/canton-jetbrains-plugin/`) | Built fresh in stage 1 of the multi-stage Dockerfile, extracted to `/opt/jetbrains-plugins/`. Loaded by the IDE backend via `idea.plugins.path` (set in `/etc/idea/idea.properties`, pointed at by `IDEA_PROPERTIES`). |
| **DAML SDK** (`dpm` + `damlc`) | Installed in stage 2 of the Dockerfile via the official `dpm` installer. Pinned by build arg `DAML_SDK_VERSION` (default `3.4.11`). |

## Open in Gateway

1. Launch JetBrains Gateway.
2. **New Connection → Dev Containers**.
3. Point at this repo's `.devcontainer/devcontainer.json`.
4. Wait for the image build (~5–10 min first time — Gradle plugin compile + DAML SDK download). Subsequent connects reuse the cached image.
5. Wait for the IDEA Community backend to download (~700 MB, one-time).
6. Wait for LSP4IJ to install from the Marketplace (~30 s).
7. JetBrains Client connects. You're in.

## Open in Toolbox (when Gateway sunsets)

The Toolbox App's **Dev Containers** plugin reads the same `customizations.jetbrains` schema. Steps are equivalent: pick "New Dev Container", point at `.devcontainer/devcontainer.json`.

## Override the SDK version

Edit `.devcontainer/devcontainer.json`:

```jsonc
"build": {
  "args": { "DAML_SDK_VERSION": "3.5.0" }
}
```

Then rebuild the container (Gateway: "Rebuild Container"). The `dpm install <version>` in the Dockerfile picks it up.

## Verify it's working (smoke test)

> SDK 3.4.x ships via **dpm** (Daml Package Manager). There is no top-level `daml`
> binary on dpm-based SDKs — every command is `dpm <subcommand>`. Our plugin
> invokes `dpm damlc ide` directly; you don't need a `daml` shim.

In the integrated terminal of the running JetBrains backend:

```bash
dpm version                                             # SDK 3.4.11 reported
dpm damlc --help                                        # IDE/build commands available
echo $IDEA_PROPERTIES                                   # /etc/idea/idea.properties
cat   $IDEA_PROPERTIES                                  # idea.plugins.path=/opt/jetbrains-plugins
ls /opt/jetbrains-plugins/canton-jetbrains-plugin/lib/  # bundled plugin .jars
```

In the IDE itself:

- **Settings → Plugins → Installed**: both **DAML** and **LSP4IJ** should appear.
- `dpm new sandbox-test && cd sandbox-test`. Open `daml/Main.daml`:
  - DAML icon on the editor tab; keywords (`template`, `signatory`, `controller`) highlighted.
  - Within ~5 s the LSP semantic tokens layer enriches the colours.
  - Hover any identifier → type tooltip.
  - Cmd/Ctrl+Click an identifier → jumps to definition.
  - The `Setup` script gets a "Script results" code lens — clicking it opens the **DAML Script Results** tool window (bottom) with the rendered transaction tree.
- Edit `daml.yaml` → JSON-schema completion on top-level keys.
- Run `dpm sandbox` from the terminal → JSON API reachable from the **host** at `http://localhost:7575` (port forwarding is configured).

## Known issue: `idea.plugins.path` and the RemoteDev backend

JetBrains' RemoteDev backend documentation does not *explicitly* confirm that the `IDEA_PROPERTIES` env var is honored — only the desktop-IDE docs do. The mechanism is identical (same JVM startup), and works in practice; but if **DAML** does not appear in the installed-plugins list after the backend boots, the fallback is to copy the plugin into the documented user path:

```bash
# inside the container, after the backend has booted at least once:
PRODUCT_DIR=$(ls -d ~/.local/share/JetBrains/IntelliJIdeaCommunity-* 2>/dev/null | head -1)
[ -n "$PRODUCT_DIR" ] || { echo "backend not booted yet"; exit 1; }
cp -r /opt/jetbrains-plugins/* "$PRODUCT_DIR/"
echo "copied to $PRODUCT_DIR — restart the IDE backend"
```

Then either restart the JetBrains backend (Gateway: disconnect + reconnect) or the IDE itself (`File → Restart IDE`).

## Editing the plugin from inside the container

Open `packages/canton-jetbrains-plugin/` in the IDE and use the bundled `./gradlew runIde` task — it spins up an isolated sandbox IDE inside the container with hot plugin reloading. To install a fresh build into the running container's plugin dir without restarting Gateway:

```bash
cd packages/canton-jetbrains-plugin
./gradlew --no-daemon buildPlugin
# replace the staged copy
sudo rm -rf /opt/jetbrains-plugins/canton-jetbrains-plugin
sudo unzip -q build/distributions/canton-jetbrains-plugin-*.zip -d /opt/jetbrains-plugins
# then File → Restart IDE
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Image build fails at stage 1 with `gradle` errors | The plugin source has a compile error. Run `./gradlew buildPlugin` locally (if you happen to have JDK 21) to see the full message, or read the docker build log. |
| Image build fails at stage 2 with `dpm install` failures | Network blocked? `dpm` reaches `get.digitalasset.com` and Google Artifact Registry. Retry once, then check corporate proxy/firewall. |
| Gateway connect succeeds but **DAML** plugin missing | See "Known issue" above — fall back to the per-product-dir copy. |
| `dpm damlc ide` exits immediately | Run it manually in the terminal to see the error. Most often: missing `daml.yaml` in the project root, or a corrupt SDK install. `dpm install ${DAML_SDK_VERSION}` from the terminal forces a re-install. |
| Forwarded port not reachable from host | Docker Desktop port forwarding glitches. Restart Docker Desktop. |

## Files in this folder

```
.devcontainer/
├── Dockerfile         # multi-stage: stage 1 builds plugin, stage 2 = runtime
├── devcontainer.json  # config + JetBrains/VSCode customizations + ports
├── postcreate.sh      # one-shot sanity checks at first container start
└── README.md          # this file
```

## Out of scope

- The customer-facing templates at `packages/canton-devenv-start/templates/.devcontainer/{latest,stable}/` are **not** modified — those still target VSCode users. JetBrains support for those is a follow-up after the plugin has a published download URL (Marketplace listing or GitHub Release).
