package com.moonsonglabs.daml.syntax

import com.moonsonglabs.daml.DamlKeywords

object DamlHighlightingClassifier {
    enum class Role {
        MODULE_NAME,
        DECLARATION_NAME,
        CHOICE_NAME,
        FIELD_NAME,
        TYPE_PARAMETER,
        IMPORT_SYMBOL,
        SCRIPT_DECLARATION,
        BUILTIN,
        PARTY_NAME,
        PREDEFINED_VALUE
    }

    private val moduleDeclarationRegex = Regex(
        """^\s*module\s+([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\b"""
    )
    private val importDeclarationRegex = Regex(
        """^\s*import\s+(?:qualified\s+)?([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\b"""
    )
    private val declarationRegex = Regex(
        """^\s*(?:template|interface|data|newtype|type|class|exception)\s+([A-Z][A-Za-z0-9_']*)\b"""
    )
    private val interfaceInstanceRegex = Regex(
        """^\s*interface\s+instance\s+([A-Z][A-Za-z0-9_']*)\s+for\s+([A-Z][A-Za-z0-9_']*)\b"""
    )
    private val choiceRegex = Regex(
        """^\s*(?:(?:nonconsuming|preconsuming|postconsuming)\s+)?choice\s+([A-Z][A-Za-z0-9_']*)\b"""
    )
    private val controllerFirstChoiceRegex = Regex(
        """^\s*controller\b.*\bcan\s+([A-Z][A-Za-z0-9_']*)\b"""
    )
    private val dataTypeParameterRegex = Regex(
        """^\s*(?:data|newtype|type)\s+[A-Z][A-Za-z0-9_']*((?:\s+[a-z_][A-Za-z0-9_']*)+)"""
    )
    private val partyBindingRegex = Regex(
        """(?m)^\s*([a-z_][A-Za-z0-9_']*)\s*<-\s*(?:allocateParty|allocatePartyWithHint)\b"""
    )
    private val identifierRegex = Regex("""[A-Za-z_][A-Za-z0-9_']*""")

    fun roleAt(fileText: String, tokenStart: Int, tokenText: String): Role? {
        if (tokenText.isEmpty() || tokenStart !in fileText.indices) return null
        if (!isIdentifier(tokenText)) return null

        val tokenEnd = tokenStart + tokenText.length
        val lineStart = fileText.lastIndexOf('\n', tokenStart - 1).let { if (it == -1) 0 else it + 1 }
        val lineEnd = fileText.indexOf('\n', tokenStart).let { if (it == -1) fileText.length else it }
        val line = fileText.substring(lineStart, lineEnd)
        val lineOffset = tokenStart - lineStart
        val tokenEndInLine = tokenEnd - lineStart
        val after = line.substring(tokenEndInLine).trimStart()

        if (isTypeIdentifier(tokenText) && after.startsWith(".")) return Role.MODULE_NAME

        moduleDeclarationRegex.find(line)?.let { match ->
            if (match.groupContains(1, lineOffset, tokenEndInLine)) return Role.MODULE_NAME
        }

        importDeclarationRegex.find(line)?.let { match ->
            if (isInsideImportList(line, lineOffset)) return Role.IMPORT_SYMBOL
            if (match.groupContains(1, lineOffset, tokenEndInLine)) return Role.MODULE_NAME
        }

        choiceRegex.find(line)?.let { match ->
            if (match.groupContains(1, lineOffset, tokenEndInLine)) return Role.CHOICE_NAME
        }
        controllerFirstChoiceRegex.find(line)?.let { match ->
            if (match.groupContains(1, lineOffset, tokenEndInLine)) return Role.CHOICE_NAME
        }

        declarationRegex.find(line)?.let { match ->
            if (match.groupContains(1, lineOffset, tokenEndInLine)) return Role.DECLARATION_NAME
        }
        interfaceInstanceRegex.find(line)?.let { match ->
            if (match.groupContains(1, lineOffset, tokenEndInLine) || match.groupContains(2, lineOffset, tokenEndInLine)) {
                return Role.DECLARATION_NAME
            }
        }

        val localDeclarationRole = localDeclarationRole(line, lineOffset, tokenText)
        if (localDeclarationRole != null) return localDeclarationRole

        if (tokenText in partyNames(fileText)) return Role.PARTY_NAME

        if (tokenText == "self" || tokenText == "this") return Role.PREDEFINED_VALUE

        if (isTypeParameter(line, lineOffset, tokenText)) return Role.TYPE_PARAMETER

        if (tokenText in DamlKeywords.builtins) return Role.BUILTIN

        return null
    }

    private fun localDeclarationRole(line: String, lineOffset: Int, tokenText: String): Role? {
        if (!isValueIdentifier(tokenText)) return null

        val before = line.substring(0, lineOffset)
        val after = line.substring(lineOffset + tokenText.length)
        val beforeTrimmed = before.trimEnd()
        val afterTrimmed = after.trimStart()
        val leadingIndent = line.indexOfFirst { !it.isWhitespace() }.let { if (it == -1) line.length else it }
        val topLevel = leadingIndent == 0
        val declarationStart = beforeTrimmed.isEmpty()
        val fieldStart = declarationStart ||
            beforeTrimmed.endsWith("with") ||
            beforeTrimmed.endsWith(";") ||
            beforeTrimmed.endsWith("{") ||
            beforeTrimmed.endsWith(",")

        if (declarationStart && afterTrimmed.startsWith(":")) {
            return if (afterTrimmed.removePrefix(":").trimStart().startsWith("Script")) {
                Role.SCRIPT_DECLARATION
            } else if (topLevel) {
                Role.DECLARATION_NAME
            } else {
                Role.FIELD_NAME
            }
        }

        if (declarationStart && afterTrimmed.startsWith("=")) {
            return if (afterTrimmed.removePrefix("=").trimStart().startsWith("script")) {
                Role.SCRIPT_DECLARATION
            } else if (topLevel) {
                Role.DECLARATION_NAME
            } else {
                Role.FIELD_NAME
            }
        }

        if (declarationStart && !topLevel && afterTrimmed.isEmpty()) {
            return Role.FIELD_NAME
        }

        if (fieldStart && (
                afterTrimmed.startsWith(":") ||
                    afterTrimmed.startsWith("=") ||
                    afterTrimmed.startsWith(";") ||
                    afterTrimmed.isEmpty()
                )
        ) {
            return Role.FIELD_NAME
        }

        if (beforeTrimmed.endsWith(".")) {
            return Role.FIELD_NAME
        }

        return null
    }

    private fun isTypeParameter(line: String, lineOffset: Int, tokenText: String): Boolean {
        if (!isValueIdentifier(tokenText)) return false

        dataTypeParameterRegex.find(line)?.groups?.get(1)?.range?.let { range ->
            if (lineOffset in range) return true
        }

        val colon = line.indexOf(':')
        if (colon != -1 && lineOffset > colon) return true

        val forall = line.indexOf("forall")
        if (forall != -1 && lineOffset > forall) return true

        return false
    }

    private fun isInsideImportList(line: String, lineOffset: Int): Boolean {
        val open = line.indexOf('(')
        val close = line.lastIndexOf(')')
        return open != -1 && close > open && lineOffset in (open + 1) until close
    }

    private fun MatchResult.groupContains(groupIndex: Int, start: Int, end: Int): Boolean {
        val group = groups[groupIndex] ?: return false
        return start >= group.range.first && end <= group.range.last + 1
    }

    private fun isIdentifier(text: String): Boolean = identifierRegex.matches(text)

    private fun isValueIdentifier(text: String): Boolean = text.firstOrNull()?.let { it.isLowerCase() || it == '_' } == true

    private fun isTypeIdentifier(text: String): Boolean = text.firstOrNull()?.isUpperCase() == true

    private fun partyNames(fileText: String): Set<String> =
        partyBindingRegex.findAll(fileText)
            .mapNotNull { it.groups[1]?.value }
            .toSet()
}
