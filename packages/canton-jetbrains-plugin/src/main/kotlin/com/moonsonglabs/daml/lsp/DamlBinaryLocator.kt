package com.moonsonglabs.daml.lsp

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.moonsonglabs.daml.settings.DamlProjectSettings
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Resolves the DAML assistant binary (`daml` or `dpm`) for the active project.
 *
 * Order matches the official VSCode extension's [findAssistantCommand]:
 *   1. user-supplied override path from settings,
 *   2. dpm if [DamlProjectSettings.useDPMWhenAvailable] is true,
 *   3. daml,
 *   in each case checking PATH first then the well-known per-user install dir.
 *
 * Why: SDK pinning lives in `daml.yaml` and only the assistant binaries honor it; calling
 * `damlc` directly would bypass the per-project SDK selection.
 */
object DamlBinaryLocator {

    data class Resolution(val binary: Path, val flavor: Flavor) {
        enum class Flavor { DAML, DPM }
    }

    fun locate(project: Project): Resolution? {
        val settings = DamlProjectSettings.getInstance(project)
        settings.binaryPath.takeIf { it.isNotBlank() }?.let { override ->
            val p = Paths.get(override)
            if (Files.isExecutable(p)) {
                val flavor = if (p.fileName.toString().startsWith("dpm")) Resolution.Flavor.DPM
                             else Resolution.Flavor.DAML
                return Resolution(p, flavor)
            }
        }

        if (settings.useDPMWhenAvailable) {
            findOnPath("dpm")?.let { return Resolution(it, Resolution.Flavor.DPM) }
            wellKnown(".dpm/bin/dpm")?.let { return Resolution(it, Resolution.Flavor.DPM) }
        }

        findOnPath("daml")?.let { return Resolution(it, Resolution.Flavor.DAML) }
        wellKnown(".daml/bin/daml")?.let { return Resolution(it, Resolution.Flavor.DAML) }

        return null
    }

    private fun findOnPath(name: String): Path? {
        val pathEnv = System.getenv("PATH") ?: return null
        val exeNames = if (SystemInfo.isWindows) listOf("$name.exe", "$name.bat", "$name.cmd", name) else listOf(name)
        for (dir in pathEnv.split(java.io.File.pathSeparator)) {
            if (dir.isBlank()) continue
            for (exe in exeNames) {
                val p = Paths.get(dir, exe)
                if (Files.isExecutable(p)) return p
            }
        }
        return null
    }

    private fun wellKnown(suffix: String): Path? {
        val home = System.getProperty("user.home") ?: return null
        val p = Paths.get(home, suffix)
        return if (Files.isExecutable(p)) p else null
    }
}
