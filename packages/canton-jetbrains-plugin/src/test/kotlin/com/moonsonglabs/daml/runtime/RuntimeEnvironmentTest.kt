package com.moonsonglabs.daml.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Path

class RuntimeEnvironmentTest {
    @Test
    fun exposesIdeJavaHomeOnPath() {
        val env = RuntimeEnvironment.ideJavaEnvironment()
        val javaHome = System.getProperty("java.home")

        assertEquals(javaHome, env["JAVA_HOME"])
        assertTrue(env["PATH"].orEmpty().startsWith(Path.of(javaHome, "bin").toString()))
    }
}
