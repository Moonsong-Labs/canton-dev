package com.moonsonglabs.daml.sandbox

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files
import java.nio.file.Path

class SandboxProfileServiceTest : BasePlatformTestCase() {
    fun testDetectedManagedProfileBecomesTheActiveProfile() {
        val root = Path.of(project.basePath!!)
        Files.createDirectories(root)
        Files.writeString(root.resolve("daml.yaml"), "sdk-version: 3.4.11\nname: detected-sandbox\n")
        Files.writeString(root.resolve("managed-sandbox-profile.json"), detectedProfileJson(root))

        val service = SandboxProfileService.getInstance(project)
        val persistedDefault = SandboxDefaults.newProfile(root).apply {
            id = "persisted-default"
            name = "Managed Canton Sandbox"
        }
        service.loadState(SandboxProfileService.State(mutableListOf(persistedDefault), persistedDefault.id))

        val selected = service.selectedProfile()

        assertEquals("private-settlement", selected.id)
        assertEquals("Private Settlement Bridge", selected.name)
        assertEquals(root.toString(), selected.workspacePath)
        assertEquals(root.resolve(".canton-sandboxes/private-settlement").toString(), selected.generatedPath)
        assertEquals(3, selected.participants.size)
        assertEquals(2, selected.synchronizers.size)
        assertTrue(service.profiles().any { it.id == "persisted-default" })
    }

    fun testDetectedProfileKeepsExplicitParticipantSyncBindings() {
        val root = Path.of(project.basePath!!)
        Files.createDirectories(root)
        Files.writeString(root.resolve("daml.yaml"), "sdk-version: 3.4.11\nname: detected-sandbox\n")
        Files.writeString(root.resolve("managed-sandbox-profile.json"), detectedProfileJson(root))

        val selected = SandboxProfileService.getInstance(project).selectedProfile()

        assertTrue(selected.bindings.any { it.participantId == "bridge" && it.synchronizerId == "global" && it.connected })
        assertFalse(selected.bindings.any { it.participantId == "issuer" && it.synchronizerId == "global" && it.connected })
        assertFalse(selected.bindings.any { it.participantId == "investor" && it.synchronizerId == "global" && it.connected })
    }

    private fun detectedProfileJson(root: Path): String =
        """
        {
          "id": "private-settlement",
          "name": "Private Settlement Bridge",
          "workspacePath": "",
          "cantonVersion": "3.4.x",
          "portBase": 7400,
          "participants": [
            { "id": "issuer", "name": "issuer", "adminPort": 7412, "ledgerPort": 7411, "jsonPort": 8575 },
            { "id": "investor", "name": "investor", "adminPort": 7422, "ledgerPort": 7421, "jsonPort": 8576 },
            { "id": "bridge", "name": "bridge", "adminPort": 7432, "ledgerPort": 7431, "jsonPort": 8577 }
          ],
          "synchronizers": [
            {
              "id": "global",
              "name": "global",
              "sequencer": { "id": "globalSequencer", "name": "globalSequencer", "publicPort": 7401, "adminPort": 7402 },
              "mediator": { "id": "globalMediator", "name": "globalMediator", "adminPort": 7602 }
            },
            {
              "id": "privateSync",
              "name": "privateSync",
              "sequencer": { "id": "privateSequencer", "name": "privateSequencer", "publicPort": 7451, "adminPort": 7452 },
              "mediator": { "id": "privateMediator", "name": "privateMediator", "adminPort": 7652 }
            }
          ],
          "bindings": [
            { "participantId": "issuer", "synchronizerId": "privateSync", "connected": true },
            { "participantId": "investor", "synchronizerId": "privateSync", "connected": true },
            { "participantId": "bridge", "synchronizerId": "privateSync", "connected": true },
            { "participantId": "bridge", "synchronizerId": "global", "connected": true }
          ],
          "darAssignments": [
            {
              "darPath": "${root.resolve(".daml/dist/private-settlement-bridge-0.1.0.dar")}",
              "participantIds": ["issuer", "investor", "bridge"]
            }
          ],
          "partyAllocations": [
            { "partyHint": "IssuerPrivate", "participantId": "issuer", "synchronizerId": "privateSync" },
            { "partyHint": "InvestorPrivate", "participantId": "investor", "synchronizerId": "privateSync" },
            { "partyHint": "BridgePrivate", "participantId": "bridge", "synchronizerId": "privateSync" },
            { "partyHint": "BridgePublic", "participantId": "bridge", "synchronizerId": "global" }
          ],
          "generatedPath": ""
        }
        """.trimIndent()
}
