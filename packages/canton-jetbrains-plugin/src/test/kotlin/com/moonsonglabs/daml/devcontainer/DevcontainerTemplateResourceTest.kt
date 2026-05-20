package com.moonsonglabs.daml.devcontainer

import org.junit.Assert.assertTrue
import org.junit.Test

class DevcontainerTemplateResourceTest {
    @Test
    fun bundledDevcontainerHasRuntimeMarker() {
        val json = javaClass.getResource("/devcontainer/devcontainer.json")!!.readText()
        val dockerfile = javaClass.getResource("/devcontainer/Dockerfile")!!.readText()

        assertTrue(json.contains("CANTON_JETBRAINS_DEVCONTAINER"))
        assertTrue(json.contains("\"DAML_SDK_VERSION\": \"3.4.11\""))
        assertTrue(dockerfile.contains(DevcontainerTemplateInstaller.MARKER))
        assertTrue(dockerfile.contains("ARG DAML_SDK_VERSION=3.4.11"))
        assertTrue(dockerfile.contains("dpm install"))
    }
}
