package com.moonsonglabs.daml

import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

class DamlTokenType(debugName: String) : IElementType(debugName, DamlLanguage)

object DamlTokenTypes {
    @JvmField val WHITE_SPACE = DamlTokenType("WHITE_SPACE")
    @JvmField val LINE_COMMENT = DamlTokenType("LINE_COMMENT")
    @JvmField val BLOCK_COMMENT = DamlTokenType("BLOCK_COMMENT")
    @JvmField val DOC_COMMENT = DamlTokenType("DOC_COMMENT")
    @JvmField val PRAGMA = DamlTokenType("PRAGMA")

    @JvmField val KEYWORD = DamlTokenType("KEYWORD")
    @JvmField val DAML_KEYWORD = DamlTokenType("DAML_KEYWORD")
    @JvmField val CONTROL_KEYWORD = DamlTokenType("CONTROL_KEYWORD")

    @JvmField val TYPE_NAME = DamlTokenType("TYPE_NAME")
    @JvmField val IDENTIFIER = DamlTokenType("IDENTIFIER")

    @JvmField val STRING_LITERAL = DamlTokenType("STRING_LITERAL")
    @JvmField val CHAR_LITERAL = DamlTokenType("CHAR_LITERAL")
    @JvmField val NUMBER = DamlTokenType("NUMBER")

    @JvmField val OPERATOR = DamlTokenType("OPERATOR")
    @JvmField val LPAREN = DamlTokenType("LPAREN")
    @JvmField val RPAREN = DamlTokenType("RPAREN")
    @JvmField val LBRACE = DamlTokenType("LBRACE")
    @JvmField val RBRACE = DamlTokenType("RBRACE")
    @JvmField val LBRACKET = DamlTokenType("LBRACKET")
    @JvmField val RBRACKET = DamlTokenType("RBRACKET")
    @JvmField val COMMA = DamlTokenType("COMMA")
    @JvmField val SEMICOLON = DamlTokenType("SEMICOLON")
    @JvmField val BACKTICK = DamlTokenType("BACKTICK")

    @JvmField val BAD_CHARACTER = DamlTokenType("BAD_CHARACTER")

    @JvmField val MODULE_DECL = DamlTokenType("MODULE_DECL")
    @JvmField val IMPORT_DECL = DamlTokenType("IMPORT_DECL")
    @JvmField val TEMPLATE_DECL = DamlTokenType("TEMPLATE_DECL")
    @JvmField val CHOICE_DECL = DamlTokenType("CHOICE_DECL")
    @JvmField val INTERFACE_DECL = DamlTokenType("INTERFACE_DECL")
    @JvmField val DATA_DECL = DamlTokenType("DATA_DECL")
    @JvmField val TYPE_DECL = DamlTokenType("TYPE_DECL")

    @JvmField val FILE = IFileElementType("DAML_FILE", DamlLanguage)

    @JvmField
    val COMMENTS = TokenSet.create(LINE_COMMENT, BLOCK_COMMENT, DOC_COMMENT)

    @JvmField
    val STRINGS = TokenSet.create(STRING_LITERAL, CHAR_LITERAL)

    @JvmField
    val WHITESPACES = TokenSet.create(WHITE_SPACE)
}

/**
 * The contextual DAML keywords (Haskell shares the rest).
 *
 * Why: ported from upstream daml12.tmLanguage.xml; kept here so the lexer can match without
 * pulling the full TextMate grammar.
 */
object DamlKeywords {
    val haskellKeywords = setOf(
        "module", "where", "import", "qualified", "as", "hiding",
        "data", "newtype", "type", "class", "instance", "deriving",
        "let", "in", "do", "if", "then", "else", "case", "of",
        "default", "infix", "infixl", "infixr",
        "forall",
        "try", "catch"
    )

    val damlKeywords = setOf(
        "template", "with", "choice", "controller", "can",
        "signatory", "observer", "agreement", "ensure",
        "key", "maintainer",
        "nonconsuming", "preconsuming", "postconsuming",
        "interface", "viewtype", "requires", "implements", "coimplements",
        "exception", "for"
    )

    val controlKeywords = setOf("do", "if", "then", "else", "case", "of", "try", "catch")

    val all = haskellKeywords + damlKeywords
}
