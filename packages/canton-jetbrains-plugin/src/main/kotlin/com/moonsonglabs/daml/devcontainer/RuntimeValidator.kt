package com.moonsonglabs.daml.devcontainer

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.runtime.RuntimeEnvironment
import com.moonsonglabs.daml.settings.DamlProjectSettings
import com.moonsonglabs.daml.workspace.DamlWorkspaceService
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

@Service(Service.Level.PROJECT)
class RuntimeValidator(private val project: Project) {

    data class ToolCheck(val name: String, val ok: Boolean, val detail: String)
    data class Result(
        val insideExpectedDevcontainer: Boolean,
        val requireDevcontainerRuntime: Boolean,
        val checks: List<ToolCheck>,
        val workspace: Path?,
        val message: String
    ) {
        val ok: Boolean get() = (!requireDevcontainerRuntime || insideExpectedDevcontainer) && checks.all { it.ok }
    }

    fun validate(): Result {
        val settings = DamlProjectSettings.getInstance(project)
        val workspace = DamlWorkspaceService.getInstance(project).defaultWorkspace()
            ?: DamlWorkspaceService.getInstance(project).projectRoot()
        val inside = isInsideExpectedDevcontainer()
        val checks = listOf(
            checkTool("daml", settings.binaryPath.takeIf { it.isNotBlank() }),
            checkTool("dpm", null, required = false),
            checkTool("canton", settings.cantonBinaryPath.takeIf { it.isNotBlank() }),
            checkTool("java"),
            checkTool("node")
        )
        val missing = checks.filterNot { it.ok }.joinToString(", ") { it.name }
        val message = when {
            settings.requireDevcontainerRuntime && !inside -> "Not running inside the Canton/DAML devcontainer. Use Prepare Canton/DAML Devcontainer, then reopen with JetBrains Dev Containers."
            missing.isNotBlank() -> "Missing runtime tools: $missing"
            inside -> "Canton/DAML devcontainer runtime looks ready."
            else -> "Local Canton/DAML runtime looks ready."
        }
        settings.lastRuntimeValidation = message
        return Result(inside, settings.requireDevcontainerRuntime, checks, workspace, message)
    }

    fun requireReadyForRun() {
        val settings = DamlProjectSettings.getInstance(project)
        if (!settings.requireDevcontainerRuntime) return
        val result = validate()
        if (!result.ok) {
            throw com.intellij.execution.ExecutionException(result.message)
        }
    }

    fun isInsideExpectedDevcontainer(): Boolean =
        System.getenv("CANTON_JETBRAINS_DEVCONTAINER") == "1" ||
            System.getenv("REMOTE_CONTAINERS") == "true" ||
            Files.exists(Path.of("/.dockerenv")) && System.getenv("CODESPACES").isNullOrBlank()

    private fun checkTool(name: String, override: String? = null, required: Boolean = true): ToolCheck {
        val command = if (override.isNullOrBlank()) "command -v $name" else "test -x '${override.replace("'", "'\\''")}' && echo '${override.replace("'", "'\\''")}'"
        val output = runShell(command)
        if (output.exitCode == 0 && output.stdout.trim().isNotBlank()) {
            return ToolCheck(name, true, output.stdout.trim().lineSequence().first())
        }
        return ToolCheck(name, !required, if (required) "not found" else "optional")
    }

    private fun runShell(command: String): com.intellij.execution.process.ProcessOutput {
        val cmd = GeneralCommandLine("sh", "-lc", command)
            .withCharset(StandardCharsets.UTF_8)
        RuntimeEnvironment.applyIdeJava(cmd)
        DamlWorkspaceService.getInstance(project).projectRoot()?.let { cmd.withWorkDirectory(it.toFile()) }
        return CapturingProcessHandler(cmd).runProcess(10_000)
    }

    companion object {
        fun getInstance(project: Project): RuntimeValidator = project.service()
    }
}
