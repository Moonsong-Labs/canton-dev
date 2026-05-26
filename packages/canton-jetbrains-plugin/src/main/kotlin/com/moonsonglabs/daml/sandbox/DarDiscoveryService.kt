package com.moonsonglabs.daml.sandbox

import com.google.gson.JsonParser
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.lsp.DamlBinaryLocator
import com.moonsonglabs.daml.runtime.RuntimeEnvironment
import com.moonsonglabs.daml.settings.DamlProjectSettings
import com.moonsonglabs.daml.workspace.DamlWorkspaceService
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name

@Service(Service.Level.PROJECT)
class DarDiscoveryService(private val project: Project) {
    fun discover(profile: SandboxProfile): List<DarMetadata> {
        val roots = discoverRoots(profile)
        val paths = linkedSetOf<Path>()
        roots.forEach { root ->
            listOf(root.resolve(".daml/dist"), root.resolve("target"), root.resolve("build")).forEach { dir ->
                if (!Files.isDirectory(dir)) return@forEach
                Files.walk(dir, 4).use { stream ->
                    stream.filter { Files.isRegularFile(it) && it.name.endsWith(".dar") }
                        .forEach(paths::add)
                }
            }
        }
        profile.darAssignments.mapNotNullTo(paths) {
            runCatching { Path.of(it.darPath) }.getOrNull()?.takeIf(Files::isRegularFile)
        }
        return paths.sortedBy { it.toString() }.map(::inspectDar)
    }

    fun inspectDar(path: Path): DarMetadata {
        val metadata = DarMetadata(path = path.toString(), name = path.fileName.toString().removeSuffix(".dar"))
        val assistant = assistant(path.parent)
        if (assistant == null) return metadata
        val args = when (assistant.flavor) {
            DamlBinaryLocator.Resolution.Flavor.DPM -> listOf(
                assistant.binary.toString(),
                "inspect-dar",
                path.toString(),
                "--json"
            )
            DamlBinaryLocator.Resolution.Flavor.DAML -> listOf(
                assistant.binary.toString(),
                "damlc",
                "inspect-dar",
                path.toString(),
                "--json"
            )
        }
        val cmd = GeneralCommandLine(args)
            .withCharset(StandardCharsets.UTF_8)
            .withWorkDirectory(path.parent.toFile())
        RuntimeEnvironment.applyLocalTools(cmd, DamlProjectSettings.getInstance(project))
        val output = CapturingProcessHandler(cmd).runProcess(30_000)
        if (output.exitCode != 0 || output.isTimeout) {
            metadata.inspectError = listOf(output.stdout, output.stderr)
                .joinToString("\n")
                .trim()
                .ifBlank { "inspect-dar failed with exit code ${output.exitCode}" }
                .takeLast(1200)
            return metadata
        }
        parseInspectJson(metadata, output.stdout)
        return metadata
    }

    private fun parseInspectJson(metadata: DarMetadata, json: String) {
        runCatching {
            val root = JsonParser.parseString(json)
            if (!root.isJsonObject) return
            val obj = root.asJsonObject
            metadata.name = obj.string("name").ifBlank { metadata.name }
            metadata.version = obj.string("version")
            metadata.description = obj.string("description")
            metadata.mainPackageId = obj.string("main_package_id")
                .ifBlank { obj.string("mainPackageId") }
                .ifBlank { obj.string("package_id") }
            val templates = obj.get("templates")
            if (templates != null && templates.isJsonArray) {
                templates.asJsonArray.mapNotNullTo(metadata.templates) {
                    when {
                        it.isJsonPrimitive -> it.asString
                        it.isJsonObject -> it.asJsonObject.string("name").ifBlank { it.asJsonObject.string("templateId") }
                        else -> null
                    }
                }
            }
        }.onFailure {
            metadata.inspectError = "Failed to parse inspect-dar JSON: ${it.message}"
        }
    }

    private fun com.google.gson.JsonObject.string(name: String): String =
        get(name)?.takeIf { it.isJsonPrimitive }?.asString.orEmpty()

    private fun assistant(workspace: Path?): DamlBinaryLocator.Resolution? =
        DamlBinaryLocator.locate(project, workspace)

    private fun discoverRoots(profile: SandboxProfile): List<Path> {
        val roots = linkedSetOf<Path>()
        profile.workspacePath.takeIf { it.isNotBlank() }?.let { roots.add(Path.of(it)) }
        roots.addAll(DamlWorkspaceService.getInstance(project).discoverWorkspaces())
        return roots.filter(Files::isDirectory)
    }

    companion object {
        fun getInstance(project: Project): DarDiscoveryService = project.service()
    }
}
