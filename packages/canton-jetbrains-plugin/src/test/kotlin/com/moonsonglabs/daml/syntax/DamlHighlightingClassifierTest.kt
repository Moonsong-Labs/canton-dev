package com.moonsonglabs.daml.syntax

import com.moonsonglabs.daml.syntax.DamlHighlightingClassifier.Role
import org.junit.Assert.assertEquals
import org.junit.Test

class DamlHighlightingClassifierTest {
    private val sample = javaClass.classLoader
        .getResourceAsStream("highlighting/HighlightingSample.daml")!!
        .bufferedReader()
        .use { it.readText() }

    @Test
    fun `classifies module imports and explicit import symbols`() {
        assertRole("Vault", sample.indexOf("Vault.Deposit.Test"), Role.MODULE_NAME)
        assertRole("Daml", sample.indexOf("Daml.Script"), Role.MODULE_NAME)
        assertRole("IProcessor", sample.indexOf("IProcessor)"), Role.IMPORT_SYMBOL)
    }

    @Test
    fun `classifies declarations choices fields and type parameters`() {
        assertRole("Receipt", sample.indexOf("Receipt a"), Role.DECLARATION_NAME)
        assertRole("a", sample.indexOf("Receipt a") + "Receipt ".length, Role.TYPE_PARAMETER)
        assertRole("IProcessor", sample.indexOf("IProcessor where"), Role.DECLARATION_NAME)
        assertRole("Deposit", sample.indexOf("Deposit\n  with"), Role.DECLARATION_NAME)
        assertRole("RunDeposit", sample.indexOf("RunDeposit"), Role.CHOICE_NAME)
        assertRole("operator", sample.indexOf("operator : Party"), Role.FIELD_NAME)
        assertRole("a", sample.indexOf("payload : a") + "payload : ".length, Role.TYPE_PARAMETER)
    }

    @Test
    fun `classifies scripts builtins and predefined values`() {
        assertRole("setup", sample.indexOf("setup : Script"), Role.SCRIPT_DECLARATION)
        assertRole("allocateParty", sample.indexOf("allocateParty"), Role.BUILTIN)
        assertRole("submit", sample.indexOf("submit alice"), Role.BUILTIN)
        assertRole("alice", sample.indexOf("alice <- allocateParty"), Role.PARTY_NAME)
        assertRole("alice", sample.indexOf("submit alice") + "submit ".length, Role.PARTY_NAME)

        val text = """
template T
  with owner : Party
  where
    signatory owner
    choice C : ()
      controller this.owner
      do pure self
""".trimIndent()
        assertEquals(Role.PREDEFINED_VALUE, DamlHighlightingClassifier.roleAt(text, text.indexOf("this"), "this"))
        assertEquals(Role.PREDEFINED_VALUE, DamlHighlightingClassifier.roleAt(text, text.indexOf("self"), "self"))
    }

    @Test
    fun `classifies punned record fields and qualified module aliases`() {
        val text = """
depositCfgCid <- submit operator ${'$'} createCmd DC.Config with
  operator
  public
  validatorCid = toInterfaceContractId @IValidator vRaw
""".trimIndent()

        assertEquals(Role.MODULE_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("DC.Config"), "DC"))
        assertEquals(Role.FIELD_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("operator\n"), "operator"))
        assertEquals(Role.FIELD_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("public"), "public"))
        assertEquals(Role.FIELD_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("validatorCid"), "validatorCid"))
        assertEquals(Role.BUILTIN, DamlHighlightingClassifier.roleAt(text, text.indexOf("toInterfaceContractId"), "toInterfaceContractId"))
    }

    @Test
    fun `classifies party names bound by allocateParty without coloring every local`() {
        val text = """
testDeposit = script do
  depositor <- allocateParty "depositor"
  localId <- pure "id"
  _ <- submit depositor do
    pure ()
""".trimIndent()

        assertEquals(Role.PARTY_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("depositor <-"), "depositor"))
        assertEquals(Role.PARTY_NAME, DamlHighlightingClassifier.roleAt(text, text.indexOf("submit depositor") + "submit ".length, "depositor"))
        assertEquals(null, DamlHighlightingClassifier.roleAt(text, text.indexOf("localId"), "localId"))
    }

    private fun assertRole(tokenText: String, start: Int, role: Role) {
        assertEquals(role, DamlHighlightingClassifier.roleAt(sample, start, tokenText))
    }
}
