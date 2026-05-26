package com.moonsonglabs.daml.sandbox

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.awt.Container
import javax.swing.JTabbedPane

class CantonSandboxPanelTest : BasePlatformTestCase() {
    fun `test panel constructs with default profile`() {
        val panel = CantonSandboxPanel(project)

        try {
            assertTrue(panel.componentCount > 0)
        } finally {
            panel.dispose()
        }
    }

    fun `test designer no longer embeds explorer as nested tab`() {
        val panel = CantonSandboxPanel(project)

        try {
            assertFalse(panel.containsTab("Explorer"))
            assertTrue(panel.containsTab("Topology"))
            assertTrue(panel.containsTab("Logs"))
        } finally {
            panel.dispose()
        }
    }

    fun `test tool window factory creates designer and explorer contents`() {
        val contents = CantonSandboxToolWindowFactory().createContents(project)

        try {
            assertEquals(listOf("Designer", "Explorer"), contents.map { it.name })
            assertTrue(contents[0].component is CantonSandboxPanel)
            assertTrue(contents[1].component is LedgerExplorerPanel)
        } finally {
            contents.mapNotNull { it.disposable }.forEach { it.dispose() }
        }
    }

    fun `test selecting a row for graph edit does not reopen topology details`() {
        val panel = CantonSandboxPanel(project)

        try {
            val profile = panel.privateField<SandboxProfile>("currentProfile")
            val selection = panel.privateField<TopologyGraphPanel.Selection?>("currentTopologySelection")
            assertNull(selection)

            panel.privateMethod("selectParticipantRow", String::class.java)
                .invoke(panel, profile.participants.first().id)

            assertNull(panel.privateField<TopologyGraphPanel.Selection?>("currentTopologySelection"))
        } finally {
            panel.dispose()
        }
    }

    private inline fun <reified T> Any.privateField(name: String): T {
        val field = javaClass.getDeclaredField(name)
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        return field.get(this) as T
    }

    private fun Any.privateMethod(name: String, vararg parameterTypes: Class<*>): java.lang.reflect.Method {
        val method = javaClass.getDeclaredMethod(name, *parameterTypes)
        method.isAccessible = true
        return method
    }

    private fun Container.containsTab(title: String): Boolean {
        if (this is JTabbedPane) {
            for (index in 0 until tabCount) {
                if (getTitleAt(index) == title) return true
            }
        }
        return components.filterIsInstance<Container>().any { it.containsTab(title) }
    }
}
