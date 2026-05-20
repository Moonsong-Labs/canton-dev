package com.moonsonglabs.daml.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.DamlNotifier
import com.moonsonglabs.daml.devcontainer.DevcontainerTemplateInstaller

class PrepareDevcontainerAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        object : Task.Backgroundable(project, "Preparing Canton/DAML Devcontainer", false) {
            override fun run(indicator: ProgressIndicator) {
                val result = DevcontainerTemplateInstaller.getInstance(project).installOrUpdate()
                notify(project, result)
            }
        }.queue()
    }

    private fun notify(project: Project, result: DevcontainerTemplateInstaller.InstallResult) {
        val root = result.root ?: return DamlNotifier.warn(project, "Project root not found.")
        val skipped = if (result.skipped.isEmpty()) "" else " Existing custom files were preserved; plugin copies were written with canton-jetbrains-* names."
        DamlNotifier.info(project, "Prepared Canton/DAML devcontainer under ${root.resolve(".devcontainer")}.$skipped")
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }
}
