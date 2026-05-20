package com.moonsonglabs.daml

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

/**
 * Minimal ParserDefinition: produces a flat PSI tree (every token a leaf under the file).
 *
 * Why minimal: real semantic analysis lives in the LSP. IntelliJ requires a ParserDefinition
 * to register a Language; this one satisfies the contract without doing real parsing.
 */
class DamlParserDefinition : ParserDefinition {
    override fun createLexer(project: Project?): Lexer = DamlLexer()

    override fun createParser(project: Project?): PsiParser = PsiParser { root, builder ->
        val rootMarker = builder.mark()
        while (!builder.eof()) builder.advanceLexer()
        rootMarker.done(root)
        builder.treeBuilt
    }

    override fun getFileNodeType(): IFileElementType = DamlTokenTypes.FILE
    override fun getCommentTokens(): TokenSet = DamlTokenTypes.COMMENTS
    override fun getStringLiteralElements(): TokenSet = DamlTokenTypes.STRINGS
    override fun getWhitespaceTokens(): TokenSet = DamlTokenTypes.WHITESPACES
    override fun createElement(node: ASTNode): PsiElement = ASTWrapperPsiElement(node)
    override fun createFile(viewProvider: FileViewProvider): PsiFile = DamlPsiFile(viewProvider)
}
