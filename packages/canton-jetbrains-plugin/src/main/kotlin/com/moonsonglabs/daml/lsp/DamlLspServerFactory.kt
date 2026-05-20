package com.moonsonglabs.daml.lsp

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.client.LanguageClientImpl
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import org.eclipse.lsp4j.services.LanguageServer

class DamlLspServerFactory : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider =
        DamlServerProvider(project)

    override fun createLanguageClient(project: Project): LanguageClientImpl =
        DamlLanguageClient(project)

    override fun getServerInterface(): Class<out LanguageServer> = DamlServerInterface::class.java
}
