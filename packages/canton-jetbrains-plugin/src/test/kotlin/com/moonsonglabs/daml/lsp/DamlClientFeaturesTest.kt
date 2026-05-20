package com.moonsonglabs.daml.lsp

import org.eclipse.lsp4j.ClientCapabilities
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.SemanticTokensCapabilities
import org.eclipse.lsp4j.SemanticTokensWorkspaceCapabilities
import org.eclipse.lsp4j.ServerCapabilities
import org.eclipse.lsp4j.TextDocumentClientCapabilities
import org.eclipse.lsp4j.WorkspaceClientCapabilities
import org.junit.Assert.assertNull
import org.junit.Test

class DamlClientFeaturesTest {
    @Test
    fun initializeParamsRemovesSemanticTokenCapabilities() {
        val params = InitializeParams().apply {
            capabilities = ClientCapabilities().apply {
                textDocument = TextDocumentClientCapabilities().apply {
                    semanticTokens = SemanticTokensCapabilities()
                }
                workspace = WorkspaceClientCapabilities().apply {
                    semanticTokens = SemanticTokensWorkspaceCapabilities()
                }
            }
        }

        DamlClientFeatures().initializeParams(params)

        assertNull(params.capabilities.textDocument.semanticTokens)
        assertNull(params.capabilities.workspace.semanticTokens)
    }

    @Test
    fun serverCapabilitiesIgnoreSemanticTokensProvider() {
        val capabilities = ServerCapabilities().apply {
            semanticTokensProvider = org.eclipse.lsp4j.SemanticTokensWithRegistrationOptions()
        }

        DamlClientFeatures().setServerCapabilities(capabilities)

        assertNull(capabilities.semanticTokensProvider)
    }
}
