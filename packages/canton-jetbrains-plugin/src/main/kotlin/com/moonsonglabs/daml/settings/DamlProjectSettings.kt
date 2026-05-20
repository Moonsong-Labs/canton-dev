package com.moonsonglabs.daml.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.openapi.components.service

@State(
    name = "DamlProjectSettings",
    storages = [Storage("daml.xml")]
)
@Service(Service.Level.PROJECT)
class DamlProjectSettings : PersistentStateComponent<DamlProjectSettings.State> {

    data class State(
        var binaryPath: String = "",
        var useDPMWhenAvailable: Boolean = true,
        var logLevel: String = "info",
        var telemetry: String = "opt-out",
        var autorunAllTests: Boolean = false,
        var extraArguments: String = "",
        var multiPackageIdeSupport: Boolean = true,
        var showArchived: Boolean = false,
        var showDetailedDisclosure: Boolean = false,
        var selectedView: String = "transaction"
    )

    private var state = State()

    override fun getState(): State = state
    override fun loadState(state: State) { this.state = state }

    var binaryPath: String
        get() = state.binaryPath
        set(value) { state.binaryPath = value }
    var useDPMWhenAvailable: Boolean
        get() = state.useDPMWhenAvailable
        set(value) { state.useDPMWhenAvailable = value }
    var logLevel: String
        get() = state.logLevel
        set(value) { state.logLevel = value }
    var telemetry: String
        get() = state.telemetry
        set(value) { state.telemetry = value }
    var autorunAllTests: Boolean
        get() = state.autorunAllTests
        set(value) { state.autorunAllTests = value }
    var extraArguments: String
        get() = state.extraArguments
        set(value) { state.extraArguments = value }
    var multiPackageIdeSupport: Boolean
        get() = state.multiPackageIdeSupport
        set(value) { state.multiPackageIdeSupport = value }
    var showArchived: Boolean
        get() = state.showArchived
        set(value) { state.showArchived = value }
    var showDetailedDisclosure: Boolean
        get() = state.showDetailedDisclosure
        set(value) { state.showDetailedDisclosure = value }
    var selectedView: String
        get() = state.selectedView
        set(value) { state.selectedView = value }

    companion object {
        fun getInstance(project: Project): DamlProjectSettings = project.service()
    }
}
