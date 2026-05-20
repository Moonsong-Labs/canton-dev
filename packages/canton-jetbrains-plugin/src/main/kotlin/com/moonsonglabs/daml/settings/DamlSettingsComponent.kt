package com.moonsonglabs.daml.settings

import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import com.moonsonglabs.daml.DamlBundle
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JPanel

class DamlSettingsComponent {

    val binaryPathField = TextFieldWithBrowseButton().apply {
        toolTipText = DamlBundle.message("daml.settings.binaryPath.tooltip")
        addActionListener {
            val descriptor = FileChooserDescriptor(true, false, false, false, false, false).apply {
                title = "DAML Binary"
                description = DamlBundle.message("daml.settings.binaryPath.tooltip")
            }
            val chosen = FileChooser.chooseFile(descriptor, null, null)
            if (chosen != null) text = chosen.path
        }
    }

    val cantonBinaryPathField = TextFieldWithBrowseButton().apply {
        toolTipText = DamlBundle.message("daml.settings.cantonBinaryPath.tooltip")
        addActionListener {
            val descriptor = FileChooserDescriptor(true, false, false, false, false, false).apply {
                title = "Canton Binary"
                description = DamlBundle.message("daml.settings.cantonBinaryPath.tooltip")
            }
            val chosen = FileChooser.chooseFile(descriptor, null, null)
            if (chosen != null) text = chosen.path
        }
    }

    val useDPMCheckbox = JBCheckBox(DamlBundle.message("daml.settings.useDPM.label"))

    val logLevelCombo = JComboBox(arrayOf("error", "warning", "info", "debug", "trace"))

    val telemetryCombo = JComboBox(arrayOf(
        DamlBundle.message("daml.settings.telemetry.opt-out"),
        DamlBundle.message("daml.settings.telemetry.opt-in"),
        DamlBundle.message("daml.settings.telemetry.ignored")
    ))

    val autorunCheckbox = JBCheckBox(DamlBundle.message("daml.settings.autorunAllTests.label"))

    val extraArgsField = JBTextField().apply {
        toolTipText = DamlBundle.message("daml.settings.extraArguments.tooltip")
    }

    val cantonExtraArgsField = JBTextField().apply {
        toolTipText = DamlBundle.message("daml.settings.cantonExtraArguments.tooltip")
    }

    val devcontainerProfileField = JBTextField()
    val requireDevcontainerCheckbox = JBCheckBox(DamlBundle.message("daml.settings.requireDevcontainer.label"))
    val runtimeStatusLabel = JBLabel()

    val multiPackageCheckbox = JBCheckBox(DamlBundle.message("daml.settings.multiPackage.label"))

    val panel: JPanel = FormBuilder.createFormBuilder()
        .addLabeledComponent(DamlBundle.message("daml.settings.devcontainerProfile.label"), devcontainerProfileField, 1, false)
        .addComponent(requireDevcontainerCheckbox, 1)
        .addLabeledComponent(DamlBundle.message("daml.settings.runtimeStatus.label"), runtimeStatusLabel, 1, false)
        .addLabeledComponent(DamlBundle.message("daml.settings.binaryPath.label"), binaryPathField, 1, false)
        .addLabeledComponent(DamlBundle.message("daml.settings.cantonBinaryPath.label"), cantonBinaryPathField, 1, false)
        .addComponent(useDPMCheckbox, 1)
        .addLabeledComponent(DamlBundle.message("daml.settings.logLevel.label"), logLevelCombo, 1, false)
        .addLabeledComponent(DamlBundle.message("daml.settings.telemetry.label"), telemetryCombo, 1, false)
        .addComponent(autorunCheckbox, 1)
        .addLabeledComponent(DamlBundle.message("daml.settings.extraArguments.label"), extraArgsField, 1, false)
        .addLabeledComponent(DamlBundle.message("daml.settings.cantonExtraArguments.label"), cantonExtraArgsField, 1, false)
        .addComponent(multiPackageCheckbox, 1)
        .addComponentFillVertically(JPanel(), 0)
        .panel

    val preferredFocusedComponent: JComponent = binaryPathField

    fun loadFrom(s: DamlProjectSettings) {
        devcontainerProfileField.text = s.devcontainerProfile
        requireDevcontainerCheckbox.isSelected = s.requireDevcontainerRuntime
        runtimeStatusLabel.text = s.lastRuntimeValidation
        binaryPathField.text = s.binaryPath
        cantonBinaryPathField.text = s.cantonBinaryPath
        useDPMCheckbox.isSelected = s.useDPMWhenAvailable
        logLevelCombo.selectedItem = s.logLevel
        telemetryCombo.selectedIndex = telemetryToIndex(s.telemetry)
        autorunCheckbox.isSelected = s.autorunAllTests
        extraArgsField.text = s.extraArguments
        cantonExtraArgsField.text = s.cantonExtraArguments
        multiPackageCheckbox.isSelected = s.multiPackageIdeSupport
    }

    fun saveTo(s: DamlProjectSettings) {
        s.devcontainerProfile = devcontainerProfileField.text.trim().ifBlank { "bundled-3.4.11" }
        s.requireDevcontainerRuntime = requireDevcontainerCheckbox.isSelected
        s.binaryPath = binaryPathField.text.trim()
        s.cantonBinaryPath = cantonBinaryPathField.text.trim()
        s.useDPMWhenAvailable = useDPMCheckbox.isSelected
        s.logLevel = (logLevelCombo.selectedItem as? String) ?: "info"
        s.telemetry = indexToTelemetry(telemetryCombo.selectedIndex)
        s.autorunAllTests = autorunCheckbox.isSelected
        s.extraArguments = extraArgsField.text
        s.cantonExtraArguments = cantonExtraArgsField.text
        s.multiPackageIdeSupport = multiPackageCheckbox.isSelected
    }

    fun isModified(s: DamlProjectSettings): Boolean =
        devcontainerProfileField.text.trim() != s.devcontainerProfile
            || requireDevcontainerCheckbox.isSelected != s.requireDevcontainerRuntime
            || binaryPathField.text.trim() != s.binaryPath
            || cantonBinaryPathField.text.trim() != s.cantonBinaryPath
            || useDPMCheckbox.isSelected != s.useDPMWhenAvailable
            || logLevelCombo.selectedItem != s.logLevel
            || indexToTelemetry(telemetryCombo.selectedIndex) != s.telemetry
            || autorunCheckbox.isSelected != s.autorunAllTests
            || extraArgsField.text != s.extraArguments
            || cantonExtraArgsField.text != s.cantonExtraArguments
            || multiPackageCheckbox.isSelected != s.multiPackageIdeSupport

    private fun telemetryToIndex(t: String): Int = when (t) {
        "opt-in" -> 1
        "ignored" -> 2
        else -> 0
    }
    private fun indexToTelemetry(i: Int): String = when (i) {
        1 -> "opt-in"
        2 -> "ignored"
        else -> "opt-out"
    }
}
