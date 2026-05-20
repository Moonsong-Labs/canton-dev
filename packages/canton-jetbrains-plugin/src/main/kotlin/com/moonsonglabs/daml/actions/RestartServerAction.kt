package com.moonsonglabs.daml.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.moonsonglabs.daml.DamlBundle
import com.moonsonglabs.daml.DamlNotifier
import com.redhat.devtools.lsp4ij.LanguageServerManager
import com.redhat.devtools.lsp4ij.LanguageServerManager.StopOptions

class RestartServerAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        try {
            val mgr = LanguageServerManager.getInstance(project)
            mgr.stop("daml", StopOptions().setWillDisable(false))
            mgr.start("daml")
            DamlNotifier.info(project, DamlBundle.message("daml.action.restart.success"))
        } catch (t: Throwable) {
            DamlNotifier.warn(project, DamlBundle.message("daml.action.restart.notRunning"))
        }
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }
}
