package com.moonsonglabs.daml.lsp

import com.intellij.psi.PsiFile
import com.redhat.devtools.lsp4ij.client.features.LSPClientFeatures
import com.redhat.devtools.lsp4ij.client.features.LSPSemanticTokensFeature
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.ServerCapabilities

/**
 * DAML SDK 3.4.x can advertise semantic tokens, but `damlc ide` aborts when the
 * client asks for `textDocument/semanticTokens/full` through non-VSCode clients.
 *
 * Native lexer highlighting remains available, so we explicitly hide semantic-token
 * support from both sides of the handshake until the DAML server supports this path.
 */
class DamlClientFeatures : LSPClientFeatures() {
    init {
        setSemanticTokensFeature(DisabledSemanticTokensFeature())
    }

    override fun initializeParams(params: InitializeParams) {
        super.initializeParams(params)
        params.capabilities?.textDocument?.semanticTokens = null
        params.capabilities?.workspace?.semanticTokens = null
    }

    override fun setServerCapabilities(serverCapabilities: ServerCapabilities) {
        serverCapabilities.semanticTokensProvider = null
        super.setServerCapabilities(serverCapabilities)
    }
}

private class DisabledSemanticTokensFeature : LSPSemanticTokensFeature() {
    override fun isSupported(file: PsiFile): Boolean = false
    override fun isSemanticTokensSupported(file: PsiFile): Boolean = false
    override fun shouldVisitPsiElement(file: PsiFile): Boolean = false
}
