package com.moonsonglabs.daml.navigation

object DamlModuleNames {
    private val moduleRegex = Regex(
        """(?m)^\s*module\s+([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\s*(?:\([^)]*\)\s*)?where\b"""
    )
    private val importRegex = Regex(
        """^\s*import\s+(?:qualified\s+)?([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\b"""
    )
    private val importDeclarationRegex = Regex(
        """^\s*import\s+(qualified\s+)?([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\b(?:\s+as\s+([A-Z][A-Za-z0-9_']*))?(?:\s+(hiding\s+)?\(([^)]*)\))?"""
    )
    private val symbolNameRegex = Regex("""`?[A-Za-z_][A-Za-z0-9_']*`?""")
    private val identifierRegex = Regex("""[A-Za-z_][A-Za-z0-9_']*""")
    private val declarationRegexes = listOf(
        Regex("""(?m)^\s*(interface|template|data|newtype|type|class|exception)\s+([A-Z][A-Za-z0-9_']*)\b"""),
        Regex("""(?m)^\s*(?:(?:nonconsuming|preconsuming|postconsuming)\s+)?choice\s+([A-Z][A-Za-z0-9_']*)\b"""),
        Regex("""(?m)^\s*([a-zA-Z_][A-Za-z0-9_']*)\s*:"""),
        Regex("""(?m)^\s*([a-zA-Z_][A-Za-z0-9_']*)\s*=""")
    )

    data class ModuleDeclaration(val name: String, val startOffset: Int)
    data class SymbolDeclaration(val name: String, val startOffset: Int)
    data class ImportDeclaration(
        val moduleName: String,
        val qualified: Boolean,
        val alias: String?,
        val symbols: Set<String>,
        val hiding: Boolean
    ) {
        fun exposes(symbolName: String): Boolean =
            if (symbols.isEmpty()) !hiding else if (hiding) symbolName !in symbols else symbolName in symbols

        fun qualifierMatches(qualifier: String): Boolean =
            alias == qualifier || moduleName == qualifier
    }
    data class SymbolReference(
        val name: String,
        val startOffset: Int,
        val endOffset: Int,
        val qualifier: String? = null,
        val qualifierStartOffset: Int = -1,
        val qualifierEndOffset: Int = -1
    )
    data class ImportReference(
        val moduleName: String,
        val startOffset: Int,
        val endOffset: Int,
        val symbolName: String? = null,
        val symbolStartOffset: Int = -1,
        val symbolEndOffset: Int = -1
    ) {
        fun isSymbolReference(): Boolean = symbolName != null
    }

    fun declaredModule(text: String): ModuleDeclaration? {
        val match = moduleRegex.find(text) ?: return null
        val group = match.groups[1] ?: return null
        return ModuleDeclaration(group.value, group.range.first)
    }

    fun imports(text: String): List<ImportDeclaration> =
        text.lineSequence()
            .mapNotNull { line ->
                val match = importDeclarationRegex.find(line) ?: return@mapNotNull null
                val moduleName = match.groups[2]?.value ?: return@mapNotNull null
                val symbolList = match.groups[5]?.value.orEmpty()
                ImportDeclaration(
                    moduleName = moduleName,
                    qualified = match.groups[1] != null,
                    alias = match.groups[3]?.value,
                    symbols = importSymbols(symbolList),
                    hiding = match.groups[4] != null
                )
            }
            .toList()

    fun importAt(text: String, offset: Int): ImportReference? {
        if (text.isEmpty()) return null
        val clamped = offset.coerceIn(0, text.length)
        val lineStart = text.lastIndexOf('\n', (clamped - 1).coerceAtLeast(0)).let { if (it == -1) 0 else it + 1 }
        val lineEnd = text.indexOf('\n', clamped).let { if (it == -1) text.length else it }
        val line = text.substring(lineStart, lineEnd)
        val match = importRegex.find(line) ?: return null
        val group = match.groups[1] ?: return null
        val start = lineStart + group.range.first
        val end = lineStart + group.range.last + 1
        if (clamped in start..end) return ImportReference(group.value, start, end)

        val symbol = importSymbolAt(line, lineStart, clamped, group.value) ?: return null
        return symbol
    }

    fun declarations(text: String): List<SymbolDeclaration> {
        val declarations = linkedMapOf<String, Int>()
        for (regex in declarationRegexes) {
            for (match in regex.findAll(text)) {
                val group = match.groupOrNull(2) ?: match.groupOrNull(1) ?: continue
                val name = group.value
                if (name in setOf("module", "import", "where", "let", "in", "do", "case", "of", "if", "then", "else")) {
                    continue
                }
                declarations.putIfAbsent(name, group.range.first)
            }
        }
        return declarations.map { (name, offset) -> SymbolDeclaration(name, offset) }
            .sortedBy { it.startOffset }
    }

    fun declarationNamed(text: String, symbolName: String): SymbolDeclaration? =
        declarations(text).firstOrNull { it.name == symbolName.trim('`') }

    fun declarationAt(text: String, offset: Int): SymbolDeclaration? {
        val token = identifierAt(text, offset) ?: return null
        return declarations(text).firstOrNull { declaration ->
            declaration.name == token.name && declaration.startOffset == token.startOffset
        }
    }

    fun symbolAt(text: String, offset: Int): SymbolReference? {
        if (text.isEmpty()) return null
        val token = identifierAt(text, offset) ?: return null
        if (token.endOffset < text.length && text[token.endOffset] == '.') return null

        val qualifier = qualifierBefore(text, token.startOffset)
        return token.copy(
            qualifier = qualifier?.name,
            qualifierStartOffset = qualifier?.startOffset ?: -1,
            qualifierEndOffset = qualifier?.endOffset ?: -1
        )
    }

    fun symbolAtOrNear(text: String, offset: Int): SymbolReference? {
        symbolAt(text, offset)?.let { return it }
        if (offset > 0) symbolAt(text, offset - 1)?.let { return it }
        return symbolAfterTypeApplicationMarker(text, offset)
    }

    fun symbolAfterTypeApplicationMarker(text: String, offset: Int): SymbolReference? {
        if (text.isEmpty()) return null
        val markerOffset = when {
            offset in text.indices && text[offset] == '@' -> offset
            offset > 0 && offset - 1 in text.indices && text[offset - 1] == '@' -> offset - 1
            else -> return null
        }
        var cursor = markerOffset + 1
        while (cursor < text.length && text[cursor].isWhitespace()) cursor++
        if (cursor >= text.length || !isIdentifierPart(text[cursor])) return null
        return symbolAt(text, cursor)
    }

    private fun importSymbolAt(
        line: String,
        lineStart: Int,
        offset: Int,
        moduleName: String
    ): ImportReference? {
        val open = line.indexOf('(')
        val close = line.lastIndexOf(')')
        if (open == -1 || close <= open) return null
        val absoluteOpen = lineStart + open
        val absoluteClose = lineStart + close
        if (offset !in (absoluteOpen + 1)..absoluteClose) return null

        val list = line.substring(open + 1, close)
        for (match in symbolNameRegex.findAll(list)) {
            val raw = match.value
            val nameStartInRaw = if (raw.startsWith('`')) 1 else 0
            val nameEndInRaw = raw.length - if (raw.endsWith('`')) 1 else 0
            val start = lineStart + open + 1 + match.range.first + nameStartInRaw
            val end = lineStart + open + 1 + match.range.first + nameEndInRaw
            if (offset in start..end) {
                return ImportReference(moduleName, lineStart + importRegex.find(line)!!.groups[1]!!.range.first,
                    lineStart + importRegex.find(line)!!.groups[1]!!.range.last + 1, raw.trim('`'), start, end)
            }
        }
        return null
    }

    private fun importSymbols(symbolList: String): Set<String> =
        symbolNameRegex.findAll(symbolList)
            .map { it.value.trim('`') }
            .filter { it !in setOf("module", "type") }
            .toSet()

    private fun identifierAt(text: String, offset: Int): SymbolReference? {
        val clamped = offset.coerceIn(0, text.lastIndex.coerceAtLeast(0))
        if (!isIdentifierPart(text[clamped])) return null

        var start = clamped
        while (start > 0 && isIdentifierPart(text[start - 1])) start--
        var end = clamped + 1
        while (end < text.length && isIdentifierPart(text[end])) end++

        val name = text.substring(start, end)
        if (!identifierRegex.matches(name)) return null
        return SymbolReference(name, start, end)
    }

    private fun qualifierBefore(text: String, tokenStart: Int): SymbolReference? {
        val dot = tokenStart - 1
        if (dot < 1 || text[dot] != '.') return null

        var start = dot - 1
        while (start >= 0 && (isIdentifierPart(text[start]) || text[start] == '.')) start--
        start++
        if (start >= dot) return null

        val qualifier = text.substring(start, dot)
        if (!qualifier.split('.').all { identifierRegex.matches(it) }) return null
        return SymbolReference(qualifier, start, dot)
    }

    private fun isIdentifierPart(c: Char): Boolean =
        c.isLetterOrDigit() || c == '_' || c == '\''

    private fun MatchResult.groupOrNull(index: Int): MatchGroup? =
        runCatching { groups[index] }.getOrNull()
}
