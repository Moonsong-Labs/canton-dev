package com.moonsonglabs.daml.syntax

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.PsiElement
import com.moonsonglabs.daml.DamlTokenTypes

class DamlHighlightingAnnotator : Annotator, DumbAware {
    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (element.firstChild != null) return

        val type = element.node?.elementType ?: return
        if (type != DamlTokenTypes.IDENTIFIER && type != DamlTokenTypes.TYPE_NAME) return

        val fileText = element.containingFile?.text ?: return
        val role = DamlHighlightingClassifier.roleAt(fileText, element.textRange.startOffset, element.text)
            ?: return

        holder.newSilentAnnotation(HighlightSeverity.INFORMATION)
            .range(element.textRange)
            .textAttributes(role.textAttributesKey())
            .create()
    }

    private fun DamlHighlightingClassifier.Role.textAttributesKey(): TextAttributesKey = when (this) {
        DamlHighlightingClassifier.Role.MODULE_NAME -> DamlSyntaxHighlighter.MODULE_NAME
        DamlHighlightingClassifier.Role.DECLARATION_NAME -> DamlSyntaxHighlighter.DECLARATION_NAME
        DamlHighlightingClassifier.Role.CHOICE_NAME -> DamlSyntaxHighlighter.CHOICE_NAME
        DamlHighlightingClassifier.Role.FIELD_NAME -> DamlSyntaxHighlighter.FIELD_NAME
        DamlHighlightingClassifier.Role.TYPE_PARAMETER -> DamlSyntaxHighlighter.TYPE_PARAMETER
        DamlHighlightingClassifier.Role.IMPORT_SYMBOL -> DamlSyntaxHighlighter.IMPORT_SYMBOL
        DamlHighlightingClassifier.Role.SCRIPT_DECLARATION -> DamlSyntaxHighlighter.SCRIPT_DECLARATION
        DamlHighlightingClassifier.Role.BUILTIN -> DamlSyntaxHighlighter.BUILTIN
        DamlHighlightingClassifier.Role.PARTY_NAME -> DamlSyntaxHighlighter.PARTY_NAME
        DamlHighlightingClassifier.Role.PREDEFINED_VALUE -> DamlSyntaxHighlighter.PREDEFINED_VALUE
    }
}
