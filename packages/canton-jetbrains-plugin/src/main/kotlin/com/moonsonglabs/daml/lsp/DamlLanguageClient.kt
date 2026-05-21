package com.moonsonglabs.daml.lsp

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.moonsonglabs.daml.DamlBundle
import com.moonsonglabs.daml.DamlNotifier
import com.moonsonglabs.daml.scriptresults.VirtualResourceManager
import com.redhat.devtools.lsp4ij.LanguageServerManager
import com.redhat.devtools.lsp4ij.LanguageServerManager.StopOptions
import com.redhat.devtools.lsp4ij.ServerStatus
import com.redhat.devtools.lsp4ij.client.LanguageClientImpl
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Custom DAML LanguageClient.
 *
 * Responsibilities:
 *  - Handle DAML's non-standard server→client notifications (the `daml/virtualResource/...`
 *    and `daml/sdkInstall/...` families) so the Script Results panel can stay in sync.
 *  - Run a 60s keep-alive watchdog by sending `daml/keepAlive` requests; if no response
 *    within 120s, log a warning and request LSP4IJ to restart the server.
 *
 * Why the watchdog: matches the VSCode extension's behavior. Without it, a hung damlc
 * process would silently stop responding to file edits and the user would see stale
 * diagnostics with no recovery.
 */
class DamlLanguageClient(project: Project) : LanguageClientImpl(project) {

    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "DAML-keepAlive").apply { isDaemon = true }
    }
    private var keepAliveTask: ScheduledFuture<*>? = null

    override fun handleServerStatusChanged(serverStatus: ServerStatus) {
        when (serverStatus) {
            ServerStatus.started -> startKeepAlive()
            ServerStatus.stopping, ServerStatus.stopped -> cancelKeepAlive()
            else -> {}
        }
    }

    override fun dispose() {
        cancelKeepAlive()
        scheduler.shutdownNow()
        super.dispose()
    }

    private fun startKeepAlive() {
        cancelKeepAlive()
        keepAliveTask = scheduler.scheduleWithFixedDelay({ tick() }, 60, 60, TimeUnit.SECONDS)
    }

    private fun cancelKeepAlive() {
        keepAliveTask?.cancel(false)
        keepAliveTask = null
    }

    private fun tick() {
        try {
            LanguageServerManager.getInstance(project)
                .getLanguageServer("daml")
                .thenAccept { item ->
                    val server = item?.server as? DamlServerInterface ?: return@thenAccept
                    server.keepAlive()
                        .orTimeout(120, TimeUnit.SECONDS)
                        .whenComplete { _, err ->
                            if (err != null) {
                                thisLogger().warn("DAML keep-alive failed; restarting server", err)
                                DamlNotifier.warn(
                                    project,
                                    DamlBundle.message("daml.notification.server.unresponsive"))
                                val mgr = LanguageServerManager.getInstance(project)
                                mgr.stop("daml", StopOptions().setWillDisable(false))
                                mgr.start("daml")
                            }
                        }
                }
        } catch (t: Throwable) {
            thisLogger().debug("DAML keep-alive tick suppressed", t)
        }
    }

    // ---- DAML virtual-resource server-pushed notifications ----

    @JsonNotification("daml/virtualResource/didChange")
    fun virtualResourceDidChange(payload: Map<String, Any?>) {
        val uri = payload["uri"] as? String ?: return
        val contents = payload["contents"] as? String ?: return
        VirtualResourceManager.getInstance(project).update(uri, contents)
    }

    @JsonNotification("daml/virtualResource/didProgress")
    fun virtualResourceDidProgress(payload: Map<String, Any?>) {
        val uri = payload["uri"] as? String ?: return
        val ms = (payload["millisecondsPassed"] as? Number)?.toLong() ?: return
        VirtualResourceManager.getInstance(project).updateProgress(uri, ms)
    }

    @JsonNotification("daml/virtualResource/note")
    fun virtualResourceNote(payload: Map<String, Any?>) {
        val uri = payload["uri"] as? String ?: return
        val note = (payload["note"] ?: payload["contents"] ?: payload["message"]) as? String ?: return
        VirtualResourceManager.getInstance(project).note(uri, note)
    }

    @JsonNotification("daml/sdkInstall/progress")
    fun sdkInstallProgress(payload: Map<String, Any?>) {
        thisLogger().debug("daml/sdkInstall/progress: $payload")
    }
}
