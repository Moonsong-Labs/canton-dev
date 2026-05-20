package com.moonsonglabs.daml.lsp

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.DamlBundle
import com.moonsonglabs.daml.DamlNotifier
import com.moonsonglabs.daml.settings.DamlProjectSettings
import com.redhat.devtools.lsp4ij.server.CannotStartProcessException
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Spawns the DAML LSP for a given project.
 *
 * Launch shape (mirrors VSCode's daml-extension/src/language_client.ts):
 *   `<assistant> damlc <ide|multi-ide> --<telemetry-flag> --log-level=<lvl> [--ide-identifier=...] [+RTS -M4G -N -RTS]`
 *
 * Why ide vs multi-ide: a workspace containing `multi-package.yaml` needs `multi-ide`; the
 * two are not interchangeable. The check is done at construction so a workspace switch
 * requires a server restart (which is the existing behavior in VSCode too).
 *
 * Why deferred startup failure: when prerequisites (workspace root, daml.yaml, SDK binary)
 * are missing, [start] throws [CannotStartProcessException] rather than launching a fake
 * process. Spawning `/bin/false` was the previous approach; it is POSIX-only and silently
 * misbehaves on Windows.
 */
class DamlServerProvider(private val project: Project) : ProcessStreamConnectionProvider() {

    private var startupFailure: String? = null

    init {
        configure()
    }

    override fun start() {
        startupFailure?.let { throw CannotStartProcessException(it) }
        super.start()
    }

    private fun configure() {
        val basePath = project.basePath
        val workspaceRoot: Path? = basePath?.let(Paths::get)
        if (workspaceRoot == null) {
            failStartup(DamlBundle.message("daml.notification.no.daml.yaml"))
            return
        }
        val damlYaml = workspaceRoot.resolve("daml.yaml")
        val multiPkgYaml = workspaceRoot.resolve("multi-package.yaml")
        if (!Files.exists(damlYaml) && !Files.exists(multiPkgYaml)) {
            failStartup(DamlBundle.message("daml.notification.no.daml.yaml"))
            return
        }

        val resolution = DamlBinaryLocator.locate(project)
        if (resolution == null) {
            failStartup(DamlBundle.message("daml.notification.sdk.notFound"))
            return
        }

        val settings = DamlProjectSettings.getInstance(project)
        val ideMode = if (Files.exists(multiPkgYaml) && settings.multiPackageIdeSupport) "multi-ide" else "ide"

        val args = mutableListOf<String>().apply {
            add(resolution.binary.toAbsolutePath().toString())
            add("damlc")
            add(ideMode)
            add(telemetryFlag(settings.telemetry))
            add("--log-level=${settings.logLevel}")
            if (ideMode == "multi-ide") add("--ide-identifier=intellij")
            settings.extraArguments.split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .forEach(::add)
            // GHC RTS memory headroom — observed needed on large daml-finance-style workspaces.
            add("+RTS"); add("-M4G"); add("-N"); add("-RTS")
        }

        thisLogger().info("Starting DAML LSP: " + args.joinToString(" "))
        super.setCommands(args)
        super.setWorkingDirectory(workspaceRoot.toAbsolutePath().toString())
    }

    private fun failStartup(message: String) {
        startupFailure = message
        DamlNotifier.warn(project, message)
    }

    private fun telemetryFlag(value: String): String = when (value) {
        "opt-in" -> "--telemetry"
        "ignored" -> "--telemetry-ignored"
        else -> "--optOutTelemetry"
    }
}
