package com.moonsonglabs.daml.runtime

import com.intellij.execution.configurations.GeneralCommandLine
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

object RuntimeEnvironment {
    fun ideJavaEnvironment(): Map<String, String> {
        val javaHome = System.getProperty("java.home")?.takeIf { Files.isDirectory(Path.of(it)) }
            ?: return emptyMap()
        val javaBin = Path.of(javaHome, "bin").toString()
        val currentPath = System.getenv("PATH").orEmpty()
        val path = listOf(javaBin, currentPath)
            .filter { it.isNotBlank() }
            .joinToString(File.pathSeparator)
        return mapOf(
            "JAVA_HOME" to javaHome,
            "PATH" to path
        )
    }

    fun applyIdeJava(commandLine: GeneralCommandLine): GeneralCommandLine =
        commandLine.withEnvironment(ideJavaEnvironment())
}
