package com.moonsonglabs.daml.actions

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.actionSystem.AnActionEvent
import com.moonsonglabs.daml.DamlNotifier
import com.moonsonglabs.daml.scriptresults.VirtualResourceManager
import com.redhat.devtools.lsp4ij.commands.LSPCommand
import com.redhat.devtools.lsp4ij.commands.LSPCommandAction

class ShowScriptResourceAction : LSPCommandAction() {
    private val gson = Gson()

    override fun commandPerformed(command: LSPCommand, e: AnActionEvent) {
        val project = e.project ?: return
        val args = command.originalArguments ?: command.arguments ?: emptyList()
        val parsed = parse(args)
        if (parsed == null) {
            DamlNotifier.warn(project, "Unable to open DAML script result: missing resource URI.")
            return
        }
        VirtualResourceManager.getInstance(project).showResource(parsed.title, parsed.uri)
    }

    private fun parse(args: List<Any?>): Resource? {
        val objects = args.mapNotNull(::asMap)
        for (obj in objects) {
            val uri = obj["uri"] as? String ?: obj["resource"] as? String
            if (uri != null) {
                val title = (obj["title"] as? String) ?: (obj["name"] as? String) ?: "DAML Script Results"
                return Resource(title, uri)
            }
        }
        val strings = args.filterIsInstance<String>()
        val uri = strings.firstOrNull { it.startsWith("daml://") || it.startsWith("file://") } ?: return null
        val title = strings.firstOrNull { it != uri } ?: "DAML Script Results"
        return Resource(title, uri)
    }

    @Suppress("UNCHECKED_CAST")
    private fun asMap(value: Any?): Map<String, Any?>? = when (value) {
        is Map<*, *> -> value as Map<String, Any?>
        is JsonObject -> gson.fromJson(value, Map::class.java) as Map<String, Any?>
        else -> null
    }

    private data class Resource(val title: String, val uri: String)
}
