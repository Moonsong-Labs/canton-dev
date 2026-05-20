package com.moonsonglabs.daml.syntax

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Optional companion: when the bundled TextMate plugin is present, log that the bundled
 * grammar resource ships with this plugin so users can register it manually via
 * Settings → Editor → TextMate Bundles if they want richer first-paint highlighting.
 *
 * Why optional: programmatic TextMate-bundle registration is an internal IntelliJ API
 * that has shifted between releases. A no-op log keeps the integration honest without
 * binding to an unstable surface. The native [DamlSyntaxHighlighter] already handles
 * first-paint highlighting; TextMate is a richer fallback.
 */
class DamlTextMateRegistrar : ProjectActivity {
    override suspend fun execute(project: Project) {
        thisLogger().info(
            "DAML TextMate grammar bundled at /grammars/daml.tmLanguage.xml " +
            "(scopeName: source.daml). Register via Settings → Editor → TextMate Bundles for richer highlighting."
        )
    }
}
