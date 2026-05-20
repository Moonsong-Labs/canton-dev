package com.moonsonglabs.daml.navigation

object DamlModuleNames {
    private val moduleRegex = Regex(
        """(?m)^\s*module\s+([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\s*(?:\([^)]*\)\s*)?where\b"""
    )
    private val importRegex = Regex(
        """^\s*import\s+(?:qualified\s+)?([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\b"""
    )
    private val symbolNameRegex = Regex("""`?[A-Za-z_][A-Za-z0-9_']*`?""")
    private val declarationRegexes = listOf(
        Regex("""(?m)^\s*(interface|template|data|newtype|type|class|exception)\s+([A-Z][A-Za-z0-9_']*)\b"""),
        Regex("""(?m)^\s*([a-zA-Z_][A-Za-z0-9_']*)\s*:"""),
        Regex("""(?m)^\s*([a-zA-Z_][A-Za-z0-9_']*)\s*=""")
    )

    data class ModuleDeclaration(val name: String, val startOffset: Int)
    data class SymbolDeclaration(val name: String, val startOffset: Int)
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
                val group = match.groups[2] ?: match.groups[1] ?: continue
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
}
