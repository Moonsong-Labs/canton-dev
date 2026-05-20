package com.moonsonglabs.daml.scriptresults

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

/**
 * Tracks open DAML virtual-resource URIs (`daml://compiler?file=...&top-level-decl=...`) and
 * dispatches server-pushed `daml/virtualResource/...` notifications to the matching
 * [ScriptResultsPanel].
 *
 * Why only one panel in v1: LSP4IJ does not yet expose a stable client-side hook for
 * `daml.showResource` code-lens clicks, so we cannot reliably tell *which* resource the
 * user wants foregrounded. We therefore display whichever URI most recently changed; the
 * tool window opens automatically on the first update. Per-URI tabs are deferred to v2.
 */
@Service(Service.Level.PROJECT)
class VirtualResourceManager(private val project: Project) {

    private data class Resource(var html: String = "", var note: String = "", var progressMs: Long = -1)

    private val resources = ConcurrentHashMap<String, Resource>()

    fun update(uri: String, html: String) {
        resources.computeIfAbsent(uri) { Resource() }.html = html
        applyOnEdt(uri) { panel ->
            panel.setTitle(titleFor(uri))
            panel.setHtml(html)
        }
    }

    fun updateProgress(uri: String, ms: Long) {
        resources.computeIfAbsent(uri) { Resource() }.progressMs = ms
        // Progress is informational; v2 will surface in tool-window status.
    }

    fun note(uri: String, html: String) {
        resources.computeIfAbsent(uri) { Resource() }.note = html
        applyOnEdt(uri) { it.setNote(html) }
    }

    /**
     * Bring the panel to the front and rehydrate it for [uri]. Reserved for a future
     * `daml.showResource` command handler; safe to call directly from tests.
     */
    fun showResource(title: String, uri: String) {
        ApplicationManager.getApplication().invokeLater {
            val tw = toolWindow() ?: return@invokeLater
            tw.show()
            val panel = panelOf(tw) ?: return@invokeLater
            panel.setTitle(title)
            resources[uri]?.let {
                if (it.html.isNotEmpty()) panel.setHtml(it.html)
                if (it.note.isNotEmpty()) panel.setNote(it.note)
            }
        }
    }

    private fun applyOnEdt(uri: String, block: (ScriptResultsPanel) -> Unit) {
        ApplicationManager.getApplication().invokeLater {
            val tw = toolWindow() ?: return@invokeLater
            if (!tw.isVisible) tw.show()
            val panel = panelOf(tw) ?: return@invokeLater
            block(panel)
        }
    }

    private fun toolWindow(): ToolWindow? =
        ToolWindowManager.getInstance(project).getToolWindow("DAML Script Results")

    private fun panelOf(tw: ToolWindow): ScriptResultsPanel? {
        val content = tw.contentManager.getContent(0) ?: return null
        return content.component as? ScriptResultsPanel
    }

    private fun titleFor(uri: String): String {
        // `daml://compiler?file=foo.daml&top-level-decl=bar`
        val q = uri.substringAfter('?', "")
        val params = q.split('&').mapNotNull {
            val (k, v) = it.split('=', limit = 2).let { p -> if (p.size == 2) p else return@mapNotNull null }
            URLDecoder.decode(k, StandardCharsets.UTF_8) to URLDecoder.decode(v, StandardCharsets.UTF_8)
        }.toMap()
        val decl = params["top-level-decl"]
        val file = params["file"]?.substringAfterLast('/')
        return when {
            decl != null && file != null -> "$decl  ·  $file"
            decl != null -> decl
            file != null -> file
            else -> "DAML Script Results"
        }
    }

    companion object {
        fun getInstance(project: Project): VirtualResourceManager = project.service()
    }
}
