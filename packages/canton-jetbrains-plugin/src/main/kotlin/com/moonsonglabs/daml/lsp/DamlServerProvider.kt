package com.moonsonglabs.daml.lsp

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.DamlBundle
import com.moonsonglabs.daml.DamlNotifier
import com.moonsonglabs.daml.runtime.RuntimeEnvironment
import com.moonsonglabs.daml.settings.DamlProjectSettings
import com.moonsonglabs.daml.workspace.DamlWorkspaceService
import com.redhat.devtools.lsp4ij.server.CannotStartProcessException
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import java.nio.file.Files
import java.nio.file.Path

/**
 * Spawns the DAML LSP for a given project.
 *
 * Launch shape:
 *   `<assistant> damlc ide --<telemetry-flag> --log-level=<lvl> [+RTS -M4G -N -RTS]`
 *
 * Why single-package ide: DAML SDK 3.4.x `multi-ide` is fragile under LSP4IJ/RustRover
 * and can prevent the language server from starting at all. For beta reliability we choose
 * the active package workspace (`daml.yaml`) even when the opened project has a
 * `multi-package.yaml` at the root.
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
        val workspaceService = DamlWorkspaceService.getInstance(project)
        val workspaceRoot: Path? = workspaceService.activePackageWorkspace()
            ?: workspaceService.defaultPackageWorkspace()
            ?: workspaceService.defaultWorkspace()
        if (workspaceRoot == null) {
            failStartup(DamlBundle.message("daml.notification.no.daml.yaml"))
            return
        }
        val damlYaml = workspaceRoot.resolve("daml.yaml")
        if (!Files.exists(damlYaml)) {
            failStartup(DamlBundle.message("daml.notification.no.daml.yaml"))
            return
        }

        val settings = DamlProjectSettings.getInstance(project)
        val resolution = DamlBinaryLocator.locate(project, workspaceRoot)
        if (resolution == null) {
            failStartup(DamlBundle.message("daml.notification.sdk.notFound"))
            return
        }

        val args = mutableListOf<String>().apply {
            add(resolution.binary.toAbsolutePath().toString())
            add("damlc")
            add("ide")
            add(telemetryFlag(settings.telemetry))
            add("--log-level=${settings.logLevel}")
            settings.extraArguments.split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .forEach(::add)
            // GHC RTS memory headroom — observed needed on large daml-finance-style workspaces.
            add("+RTS"); add("-M4G"); add("-N"); add("-RTS")
        }

        thisLogger().info("Starting DAML LSP: " + args.joinToString(" "))
        super.setCommands(args)
        super.setIncludeSystemEnvironmentVariables(true)
        super.setUserEnvironmentVariables(RuntimeEnvironment.ideJavaEnvironment())
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

    private fun DamlWorkspaceService.activePackageWorkspace(): Path? =
        FileEditorManager.getInstance(project).selectedFiles.asSequence()
            .mapNotNull { workspaceFor(it) }
            .firstOrNull { Files.exists(it.resolve("daml.yaml")) }
}
