package com.moonsonglabs.daml.syntax

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.HighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.psi.tree.IElementType
import com.moonsonglabs.daml.DamlLexer
import com.moonsonglabs.daml.DamlTokenTypes

class DamlSyntaxHighlighter : SyntaxHighlighterBase() {
    override fun getHighlightingLexer(): Lexer = DamlLexer()

    override fun getTokenHighlights(tokenType: IElementType?): Array<TextAttributesKey> = when (tokenType) {
        DamlTokenTypes.LINE_COMMENT -> arrayOf(LINE_COMMENT)
        DamlTokenTypes.BLOCK_COMMENT -> arrayOf(BLOCK_COMMENT)
        DamlTokenTypes.DOC_COMMENT -> arrayOf(DOC_COMMENT)
        DamlTokenTypes.PRAGMA -> arrayOf(PRAGMA)
        DamlTokenTypes.KEYWORD -> arrayOf(KEYWORD)
        DamlTokenTypes.DAML_KEYWORD -> arrayOf(DAML_KEYWORD)
        DamlTokenTypes.CONTROL_KEYWORD -> arrayOf(KEYWORD)
        DamlTokenTypes.TYPE_NAME -> arrayOf(TYPE_NAME)
        DamlTokenTypes.IDENTIFIER -> arrayOf(IDENTIFIER)
        DamlTokenTypes.STRING_LITERAL -> arrayOf(STRING)
        DamlTokenTypes.CHAR_LITERAL -> arrayOf(STRING)
        DamlTokenTypes.NUMBER -> arrayOf(NUMBER)
        DamlTokenTypes.OPERATOR -> arrayOf(OPERATOR)
        DamlTokenTypes.LPAREN, DamlTokenTypes.RPAREN -> arrayOf(PARENS)
        DamlTokenTypes.LBRACE, DamlTokenTypes.RBRACE -> arrayOf(BRACES)
        DamlTokenTypes.LBRACKET, DamlTokenTypes.RBRACKET -> arrayOf(BRACKETS)
        DamlTokenTypes.COMMA -> arrayOf(COMMA)
        DamlTokenTypes.SEMICOLON -> arrayOf(SEMICOLON)
        DamlTokenTypes.BACKTICK -> arrayOf(OPERATOR)
        DamlTokenTypes.BAD_CHARACTER -> arrayOf(HighlighterColors.BAD_CHARACTER)
        else -> emptyArray()
    }

    companion object {
        val LINE_COMMENT = TextAttributesKey.createTextAttributesKey(
            "DAML_LINE_COMMENT", DefaultLanguageHighlighterColors.LINE_COMMENT)
        val BLOCK_COMMENT = TextAttributesKey.createTextAttributesKey(
            "DAML_BLOCK_COMMENT", DefaultLanguageHighlighterColors.BLOCK_COMMENT)
        val DOC_COMMENT = TextAttributesKey.createTextAttributesKey(
            "DAML_DOC_COMMENT", DefaultLanguageHighlighterColors.DOC_COMMENT)
        val PRAGMA = TextAttributesKey.createTextAttributesKey(
            "DAML_PRAGMA", DefaultLanguageHighlighterColors.METADATA)
        val KEYWORD = TextAttributesKey.createTextAttributesKey(
            "DAML_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
        val DAML_KEYWORD = TextAttributesKey.createTextAttributesKey(
            "DAML_TEMPLATE_KEYWORD", DefaultLanguageHighlighterColors.KEYWORD)
        val TYPE_NAME = TextAttributesKey.createTextAttributesKey(
            "DAML_TYPE_NAME", DefaultLanguageHighlighterColors.CLASS_NAME)
        val IDENTIFIER = TextAttributesKey.createTextAttributesKey(
            "DAML_IDENTIFIER", DefaultLanguageHighlighterColors.IDENTIFIER)
        val STRING = TextAttributesKey.createTextAttributesKey(
            "DAML_STRING", DefaultLanguageHighlighterColors.STRING)
        val NUMBER = TextAttributesKey.createTextAttributesKey(
            "DAML_NUMBER", DefaultLanguageHighlighterColors.NUMBER)
        val OPERATOR = TextAttributesKey.createTextAttributesKey(
            "DAML_OPERATOR", DefaultLanguageHighlighterColors.OPERATION_SIGN)
        val PARENS = TextAttributesKey.createTextAttributesKey(
            "DAML_PARENS", DefaultLanguageHighlighterColors.PARENTHESES)
        val BRACES = TextAttributesKey.createTextAttributesKey(
            "DAML_BRACES", DefaultLanguageHighlighterColors.BRACES)
        val BRACKETS = TextAttributesKey.createTextAttributesKey(
            "DAML_BRACKETS", DefaultLanguageHighlighterColors.BRACKETS)
        val COMMA = TextAttributesKey.createTextAttributesKey(
            "DAML_COMMA", DefaultLanguageHighlighterColors.COMMA)
        val SEMICOLON = TextAttributesKey.createTextAttributesKey(
            "DAML_SEMICOLON", DefaultLanguageHighlighterColors.SEMICOLON)
    }
}
