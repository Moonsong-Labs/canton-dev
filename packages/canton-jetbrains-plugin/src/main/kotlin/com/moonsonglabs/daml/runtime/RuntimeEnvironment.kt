package com.moonsonglabs.daml.runtime

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.util.SystemInfo
import com.moonsonglabs.daml.sdk.DamlSdkVersions
import com.moonsonglabs.daml.settings.DamlProjectSettings
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

object RuntimeEnvironment {
    fun ideJavaEnvironment(): Map<String, String> =
        localToolEnvironment(null)

    fun localToolEnvironment(settings: DamlProjectSettings? = null): Map<String, String> {
        val javaHome = System.getProperty("java.home")?.takeIf { Files.isDirectory(Path.of(it)) }
        val javaBin = javaHome?.let { Path.of(it, "bin") }
        val path = buildPath(localToolDirectories(settings) + javaBin, System.getenv("PATH").orEmpty())
        return buildMap {
            if (javaHome != null) put("JAVA_HOME", javaHome)
            put("PATH", path)
        }
    }

    fun applyIdeJava(commandLine: GeneralCommandLine): GeneralCommandLine =
        commandLine.withEnvironment(ideJavaEnvironment())

    fun applyLocalTools(commandLine: GeneralCommandLine, settings: DamlProjectSettings? = null): GeneralCommandLine =
        commandLine.withEnvironment(localToolEnvironment(settings))

    fun findExecutable(name: String, settings: DamlProjectSettings? = null): Path? {
        val exeNames = if (SystemInfo.isWindows) listOf("$name.exe", "$name.bat", "$name.cmd", name) else listOf(name)
        val dirs = localToolDirectories(settings) + System.getenv("PATH").orEmpty()
            .split(File.pathSeparator)
            .filter { it.isNotBlank() }
            .map { Path.of(it) }

        for (dir in dirs) {
            for (exe in exeNames) {
                val candidate = dir.resolve(exe)
                if (Files.isExecutable(candidate)) return candidate
            }
        }
        return null
    }

    internal fun localToolDirectories(
        settings: DamlProjectSettings? = null,
        userHome: String? = System.getProperty("user.home")
    ): List<Path> {
        val dirs = mutableListOf<Path>()
        settings?.binaryPath?.takeIf { it.isNotBlank() }?.let { Path.of(it).parent }?.let(dirs::add)
        settings?.cantonBinaryPath?.takeIf { it.isNotBlank() }?.let { Path.of(it).parent }?.let(dirs::add)

        val sdkVersion = settings?.selectedSdkVersion?.takeIf { it.isNotBlank() } ?: DamlSdkVersions.DEFAULT
        userHome?.let { home ->
            dirs.add(Path.of(home, ".daml", "sdk", sdkVersion, "daml"))
            dirs.add(Path.of(home, ".dpm", "bin"))
            dirs.add(Path.of(home, ".daml", "bin"))
        }
        return dirs.distinct()
    }

    internal fun buildPath(prefixDirs: List<Path?>, basePath: String): String =
        (prefixDirs.filterNotNull().map { it.toString() } + basePath.split(File.pathSeparator))
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(File.pathSeparator)
}
