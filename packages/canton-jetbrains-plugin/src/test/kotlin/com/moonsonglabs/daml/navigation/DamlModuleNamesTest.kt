package com.moonsonglabs.daml.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DamlModuleNamesTest {
    @Test
    fun `parses module declaration`() {
        val text = "module Vault.Impl.SimpleProcessor where\n"
        assertEquals(
            DamlModuleNames.ModuleDeclaration("Vault.Impl.SimpleProcessor", text.indexOf("Vault")),
            DamlModuleNames.declaredModule(text)
        )
    }

    @Test
    fun `parses qualified import at component offset`() {
        val text = "import qualified Vault.Impl.SimpleProcessor as Processor\n"
        val ref = DamlModuleNames.importAt(text, text.indexOf("SimpleProcessor"))!!
        assertEquals("Vault.Impl.SimpleProcessor", ref.moduleName)
        assertEquals(text.indexOf("Vault"), ref.startOffset)
    }

    @Test
    fun `ignores non import lines`() {
        assertNull(DamlModuleNames.importAt("processor = 1\n", 2))
    }

    @Test
    fun `parses explicit import symbol at symbol offset`() {
        val text = "import Vault.Deposit.Processor (IProcessor)\n"
        val ref = DamlModuleNames.importAt(text, text.indexOf("IProcessor"))!!
        assertEquals("Vault.Deposit.Processor", ref.moduleName)
        assertEquals("IProcessor", ref.symbolName)
        assertEquals(text.indexOf("IProcessor"), ref.symbolStartOffset)
    }

    @Test
    fun `finds interface declaration`() {
        val text = """
module Vault.Deposit.Processor where

interface IProcessor where
  viewtype V
""".trimIndent()
        val declaration = DamlModuleNames.declarationNamed(text, "IProcessor")!!
        assertEquals(text.indexOf("IProcessor"), declaration.startOffset)
    }
}
