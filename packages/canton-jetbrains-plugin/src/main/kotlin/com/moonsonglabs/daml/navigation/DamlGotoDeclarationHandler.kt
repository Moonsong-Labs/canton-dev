package com.moonsonglabs.daml.navigation

import com.intellij.codeInsight.navigation.actions.GotoDeclarationHandler
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.moonsonglabs.daml.DamlFileType

class DamlGotoDeclarationHandler : GotoDeclarationHandler {
    override fun getGotoDeclarationTargets(
        sourceElement: PsiElement?,
        offset: Int,
        editor: Editor
    ): Array<PsiElement>? {
        val file = sourceElement?.containingFile ?: return null
        if (file.fileType !== DamlFileType) return null
        val import = DamlModuleNames.importAt(file.text, offset) ?: return null
        val target = DamlModuleResolver.getInstance(file.project)
            .resolveImport(import, file.virtualFile)
            ?: return null
        return arrayOf(target)
    }

    override fun getActionText(context: DataContext): String =
        "Go to DAML Module Declaration"
}
