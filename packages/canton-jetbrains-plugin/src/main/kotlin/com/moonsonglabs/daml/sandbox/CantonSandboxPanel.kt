package com.moonsonglabs.daml.sandbox

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets
import java.awt.LayoutManager
import java.awt.RenderingHints
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.nio.file.Path
import javax.swing.BorderFactory
import javax.swing.DefaultComboBoxModel
import javax.swing.DefaultListCellRenderer
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JCheckBox
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JPopupMenu
import javax.swing.JScrollPane
import javax.swing.JSplitPane
import javax.swing.JTabbedPane
import javax.swing.JOptionPane
import javax.swing.JTable
import javax.swing.JMenuItem
import javax.swing.ListSelectionModel
import javax.swing.SwingUtilities
import javax.swing.JTextPane
import javax.swing.SwingConstants
import javax.swing.plaf.basic.BasicSplitPaneDivider
import javax.swing.plaf.basic.BasicSplitPaneUI
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.DefaultTableModel
import javax.swing.table.JTableHeader
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants

class CantonSandboxPanel(private val project: Project) : JPanel(BorderLayout()), Disposable {
    private val profiles = SandboxProfileService.getInstance(project)
    private val sessions = SandboxSessionService.getInstance(project)
    private val explorerNavigation = SandboxExplorerNavigationService.getInstance(project)
    private val darDiscovery = DarDiscoveryService.getInstance(project)
    private val graph = TopologyGraphPanel()

    private val profileComboModel = DefaultComboBoxModel<SandboxProfile>()
    private val profileCombo = ProfileComboBox(profileComboModel) { deleteProfile(it) }
    private val nameField = JBTextField()
    private val portBaseField = JBTextField()

    private val participantModel = tableModel("Participant", "Ledger", "Admin", "JSON")
    private val syncModel = tableModel("Sync Domain", "Sequencer", "Seq Public", "Seq Admin", "Mediator", "Med Admin")
    private val connectionModel = tableModel("Participant", "Sync Domain", "Connected")
    private val darModel = tableModel("DAR", "Name", "Version", "Main Package", "Assigned Participants", "Inspect")
    private val partyModel = tableModel("Participant", "Sync Domain", "Party Hint")

    private val participantTable = table(participantModel)
    private val syncTable = table(syncModel)
    private val connectionTable = table(connectionModel)
    private val darTable = table(darModel)
    private val partyTable = table(partyModel)
    private val darParticipantList = JBList(DefaultListModel<String>()).apply {
        selectionMode = ListSelectionModel.MULTIPLE_INTERVAL_SELECTION
    }
    private val partyField = JBTextField("Alice")
    private val partyParticipantCombo = JComboBox<String>()
    private val partySyncCombo = JComboBox<String>()

    private val componentPalette = TopologyComponentPalettePanel()
    private val logArea = JTextPane().apply {
        isEditable = false
        background = TopologyGraphTheme.canvas
        foreground = TopologyGraphTheme.detail
        font = Font(Font.MONOSPACED, Font.PLAIN, 12)
        border = JBUI.Borders.empty(10)
    }

    private var currentProfile: SandboxProfile = profiles.selectedProfile()
    private var latestDars: List<DarMetadata> = emptyList()
    private var latestSession: SandboxSessionState = sessions.snapshot()
    private var currentTopologySelection: TopologyGraphPanel.Selection? = null
    private var sessionListener: Disposable? = null
    private var loadingProfile = false
    private var suppressTableNavigation = false

    init {
        background = TopologyGraphTheme.canvas
        border = BorderFactory.createEmptyBorder(6, 6, 6, 6)
        styleNetworkControls()
        add(toolbar(), BorderLayout.NORTH)
        add(mainContent(), BorderLayout.CENTER)
        wireTableNavigation()
        refreshProfiles()
        loadProfile(profiles.selectedProfile())
        sessionListener = sessions.addListener { state ->
            latestSession = state
            SwingUtilities.invokeLater { renderSession(state) }
        }
    }

    private fun toolbar(): JComponent {
        val panel = JPanel(BorderLayout(8, 0)).apply {
            background = TopologyGraphTheme.canvas
            border = JBUI.Borders.empty(0, 0, 6, 0)
        }
        profileCombo.addActionListener {
            if (!loadingProfile && !profileCombo.isDeletingProfileFromPopup) (profileCombo.selectedItem as? SandboxProfile)?.let { profile ->
                profiles.selectProfile(profile.id)
                loadProfile(profile)
            }
        }
        nameField.columns = 24
        portBaseField.columns = 6
        compactToolbarControl(profileCombo)
        compactToolbarControl(nameField)
        compactToolbarControl(portBaseField)
        listOf(nameField, portBaseField).forEach {
            it.addFocusListener(object : FocusAdapter() {
                override fun focusLost(e: FocusEvent) {
                    saveProfileFields()
                }
            })
        }

        panel.add(row(
            networkLabel("Profile"),
            profileCombo,
            button("New", AllIcons.General.Add) { loadProfile(profiles.createProfile()) },
            networkLabel("Name"),
            nameField,
            networkLabel("Port base"),
            portBaseField
        ), BorderLayout.CENTER)
        panel.add(row(
            button("Start", AllIcons.Actions.Execute) { saveProfileFields(); sessions.startLocal(currentProfile) },
            button("Stop", AllIcons.Actions.Suspend) { sessions.stop() },
            popupButton("More") { popup ->
                popup.add(menuItem("Validate Profile", AllIcons.Actions.Checked) { validateProfile() })
                popup.add(menuItem("Generate Files", AllIcons.FileTypes.Config) { doGenerate() })
                popup.add(menuItem("Refresh Health", AllIcons.Actions.Refresh) { sessions.refreshHealth(currentProfile) })
                popup.add(menuItem("Rebase Ports", AllIcons.Actions.Refresh) { rebasePorts() })
                popup.addSeparator()
                popup.add(menuItem("Clean Runtime Data", AllIcons.Actions.GC) { sessions.clean(currentProfile) })
                popup.add(menuItem("Delete Profile", AllIcons.General.Remove) { deleteProfile(currentProfile) })
            }
        ), BorderLayout.EAST)
        return panel
    }

    private fun topologyTab(): JComponent {
        graph.setSelectionListener { selection -> selectTopology(selection) }
        graph.setActivationListener { selection ->
            currentTopologySelection = selection
            componentPalette.select(selection)
            editSelectedTopologyNode()
        }
        graph.setPositionListener { selection, x, y -> updateTopologyPosition(selection, x, y) }
        graph.setConnectionListener { participantId, synchronizerId, connected ->
            setGraphConnection(participantId, synchronizerId, connected)
        }
        graph.setContextMenuListener { selection, point -> showTopologyContextMenu(selection, point.x, point.y) }
        componentPalette.setSelectionListener { selection -> selectTopology(selection) }
        val workspace = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, topologyPalette(), JBScrollPane(graph)).apply {
            ui = TopologySplitPaneUI()
            resizeWeight = 0.0
            dividerLocation = 220
            dividerSize = 8
            isContinuousLayout = true
            border = BorderFactory.createEmptyBorder()
            background = TopologyGraphTheme.canvas
        }
        return JPanel(BorderLayout()).apply {
            add(workspace, BorderLayout.CENTER)
        }
    }

    private fun topologyPalette(): JComponent =
        JPanel(BorderLayout()).apply {
            background = TopologyGraphTheme.panel
            border = BorderFactory.createLineBorder(TopologyGraphTheme.panelBorder)
            add(JBScrollPane(componentPalette).apply {
                border = BorderFactory.createEmptyBorder()
                viewport.background = TopologyGraphTheme.panel
            }, BorderLayout.CENTER)
            add(JPanel(GridBagLayout()).apply {
                background = TopologyGraphTheme.panel
                border = BorderFactory.createMatteBorder(1, 0, 0, 0, TopologyGraphTheme.panelBorder)
                var y = 0
                listOf(
                    topologyActionButton("Add PN", TopologyGraphTheme.participantBorder, AllIcons.General.Add) { addParticipantFromGraph() },
                    topologyActionButton("Add SD", TopologyGraphTheme.syncBorder, AllIcons.General.Add) { addSynchronizerFromGraph() },
                    topologyActionButton("Arrange", TopologyGraphTheme.edge, AllIcons.Actions.Refresh) { autoArrangeTopology() },
                    topologyMenuButton("Selection", TopologyGraphTheme.selected) { popup ->
                        popup.add(menuItem("Edit Selected", AllIcons.Actions.Edit) { editSelectedTopologyNode() })
                        popup.add(menuItem("Edit Connection", AllIcons.Actions.ToggleVisibility) { editGraphConnection() })
                        popup.add(menuItem("Remove Selected", AllIcons.General.Remove) { removeSelectedTopologyNode() })
                    }
                ).forEach { action ->
                    val c = GridBagConstraints().apply {
                        gridx = 0
                        gridy = y++
                        fill = GridBagConstraints.HORIZONTAL
                        weightx = 1.0
                        insets = java.awt.Insets(2, 2, 2, 2)
                    }
                    add(action, c)
                }
            }, BorderLayout.SOUTH)
        }

    private fun topologyActionButton(text: String, border: Color, icon: javax.swing.Icon? = null, action: () -> Unit): JButton =
        button(text, icon, action).apply {
            foreground = TopologyGraphTheme.text
            background = TopologyGraphTheme.panel
            isOpaque = true
            this.border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(border),
                JBUI.Borders.empty(5, 8)
            )
        }

    private fun topologyMenuButton(text: String, border: Color, builder: (JPopupMenu) -> Unit): JButton =
        popupButton(text, builder).apply {
            foreground = TopologyGraphTheme.text
            background = TopologyGraphTheme.panel
            isOpaque = true
            this.border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(border),
                JBUI.Borders.empty(5, 8)
            )
        }

    private fun mainContent(): JComponent {
        val tabs = styledTabbedPane()
        tabs.addTab("Topology", topologyTab())
        tabs.addTab("Nodes", nodesTab())
        tabs.addTab("DARs", darsTab())
        tabs.addTab("Parties", partiesTab())
        tabs.addTab("Logs", logsTab())
        return JPanel(BorderLayout()).apply {
            background = TopologyGraphTheme.canvas
            add(tabs, BorderLayout.CENTER)
        }
    }

    private fun nodesTab(): JComponent {
        val tabs = styledTabbedPane()
        tabs.addTab("Participants", networkCard(themedScrollPane(participantTable)))
        tabs.addTab("Sync Domains", networkCard(themedScrollPane(syncTable)))
        tabs.addTab("Connections", networkCard(themedScrollPane(connectionTable)))
        return networkSurface(tabs)
    }

    private fun darsTab(): JComponent {
        val panel = networkPanel(BorderLayout(8, 8))
        panel.add(networkCard(themedScrollPane(darTable)), BorderLayout.CENTER)
        panel.add(networkCard(
            content = JPanel(BorderLayout(0, 8)).apply {
                background = TopologyGraphTheme.panel
                add(networkCardTitle("Assign to participants"), BorderLayout.NORTH)
                add(themedScrollPane(darParticipantList), BorderLayout.CENTER)
                add(row(
                    button("Refresh DARs", AllIcons.Actions.Refresh) { refreshDars() },
                    button("Add DAR", AllIcons.General.Add) { addDarFromChooser() },
                    button("Assign Selected", AllIcons.Actions.Commit) {
                        val dar = selectedDarPath() ?: return@button
                        val participantIds = darParticipantList.selectedValuesList.mapNotNull { name ->
                            currentProfile.participants.firstOrNull { it.name == name }?.id
                        }
                        assignDar(dar, participantIds)
                    },
                    button("Remove Assignment", AllIcons.General.Remove) {
                        selectedDarPath()?.let { path ->
                            currentProfile.darAssignments.removeIf { it.darPath == path }
                            persistAndRefresh()
                        }
                    }
                ), BorderLayout.SOUTH)
            }
        ).apply {
            preferredSize = Dimension(320, 160)
        }, BorderLayout.EAST)
        return panel
    }

    private fun partiesTab(): JComponent {
        val editor = row(
            networkLabel("Party"),
            partyField,
            networkLabel("Participant"),
            partyParticipantCombo,
            networkLabel("Sync"),
            partySyncCombo,
            button("Allocate in Profile", AllIcons.General.Add) {
                val participant = currentProfile.participants.firstOrNull { it.name == partyParticipantCombo.selectedItem }
                val sync = currentProfile.synchronizers.firstOrNull { it.name == partySyncCombo.selectedItem }
                if (participant != null && sync != null && partyField.text.isNotBlank()) {
                    currentProfile.partyAllocations.add(PartyAllocation(partyField.text.trim(), participant.id, sync.id))
                    persistAndRefresh()
                }
            },
            button("Remove Selected", AllIcons.General.Remove) { removeSelectedPartyAllocation() }
        )
        return networkPanel(BorderLayout(8, 8)).apply {
            add(networkCard(themedScrollPane(partyTable)), BorderLayout.CENTER)
            add(networkCard(editor), BorderLayout.SOUTH)
        }
    }

    private fun logsTab(): JComponent =
        networkPanel(BorderLayout()).apply {
            add(networkCard(themedScrollPane(logArea)), BorderLayout.CENTER)
        }

    private fun loadProfile(profile: SandboxProfile) {
        loadingProfile = true
        try {
            currentProfile = profile
            currentTopologySelection = null
            graph.select(null)
            nameField.text = profile.name
            portBaseField.text = profile.portBase.toString()
            graph.setProfile(profile)
            refreshProfiles()
            profileCombo.selectedIndex = profiles.profiles().indexOfFirst { it.id == profile.id }.coerceAtLeast(0)
            renderProfileTables()
            renderInspector(currentTopologySelection)
            renderSession(latestSession)
        } finally {
            loadingProfile = false
        }
    }

    private fun refreshProfiles() {
        val selectedId = currentProfile.id
        val wasLoading = loadingProfile
        loadingProfile = true
        try {
            profileComboModel.removeAllElements()
            profiles.profiles().forEach(profileComboModel::addElement)
            profileCombo.selectedIndex = profiles.profiles().indexOfFirst { it.id == selectedId }.coerceAtLeast(0)
        } finally {
            loadingProfile = wasLoading
        }
    }

    private fun deleteProfile(profile: SandboxProfile) {
        val allProfiles = profiles.profiles()
        if (allProfiles.size <= 1) {
            Messages.showInfoMessage(project, "Keep at least one sandbox profile.", "Managed Canton Sandboxes")
            refreshProfiles()
            return
        }

        val preferredProfileId = currentProfile.id.takeIf { it != profile.id }
        profiles.deleteProfile(profile.id)
        val nextProfile = preferredProfileId
            ?.let { id -> profiles.profiles().firstOrNull { it.id == id } }
            ?: profiles.selectedProfile()
        profiles.selectProfile(nextProfile.id)
        loadProfile(nextProfile)
    }

    private fun saveProfileFields() {
        currentProfile.name = nameField.text.trim().ifBlank { "Managed Canton Sandbox" }
        currentProfile.portBase = portBaseField.text.toIntOrNull() ?: currentProfile.portBase
        profiles.upsert(currentProfile)
        graph.setProfile(currentProfile)
    }

    private fun persistAndRefresh() {
        saveProfileFields()
        profiles.upsert(currentProfile)
        loadProfile(currentProfile)
    }

    private fun doGenerate() {
        saveProfileFields()
        val profile = currentProfile
        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching { sessions.generate(profile) }
                .onSuccess { generated ->
                    SwingUtilities.invokeLater {
                        Messages.showInfoMessage(project, "Generated files under ${generated.root}", "Managed Canton Sandboxes")
                    }
                }
                .onFailure { error ->
                    SwingUtilities.invokeLater {
                        Messages.showErrorDialog(project, error.message ?: "Generation failed", "Managed Canton Sandboxes")
                    }
                }
        }
    }

    private fun validateProfile() {
        saveProfileFields()
        val profile = currentProfile
        val generated = latestSession.generated
        ApplicationManager.getApplication().executeOnPooledThread {
            val result = SandboxRuntimeValidator.getInstance(project).validate(profile, generated)
            SwingUtilities.invokeLater {
                Messages.showInfoMessage(project, buildString {
                    appendLine(result.message)
                    result.checks.forEach { check ->
                        appendLine("${if (check.ok) "OK" else "FAIL"} ${check.name}: ${check.detail}")
                    }
                }, "Sandbox Validation")
            }
        }
    }

    private fun addParticipant() {
        val next = currentProfile.participants.size + 1
        val participant = SandboxDefaults.participant(next, currentProfile.portBase)
        currentProfile.participants.add(participant)
        currentProfile.synchronizers.forEach { currentProfile.bindings.add(ParticipantSyncBinding(participant.id, it.id, true)) }
        persistAndRefresh()
    }

    private fun addParticipantFromGraph() {
        addParticipant()
        currentProfile.participants.lastOrNull()?.let {
            selectTopology(TopologyGraphPanel.Selection.Participant(it.id))
        }
    }

    private fun addSynchronizerFromGraph() {
        addSynchronizer()
        currentProfile.synchronizers.lastOrNull()?.let {
            selectTopology(TopologyGraphPanel.Selection.Synchronizer(it.id))
        }
    }

    private fun editSelectedTopologyNode() {
        when (val selection = currentTopologySelection) {
            is TopologyGraphPanel.Selection.Participant -> {
                selectParticipantRow(selection.id)
                editSelectedParticipant()
            }
            is TopologyGraphPanel.Selection.Synchronizer -> {
                selectSynchronizerRow(selection.id)
                editSelectedSynchronizer()
            }
            is TopologyGraphPanel.Selection.Sequencer -> {
                selectedSynchronizerId(selection)?.let {
                    selectSynchronizerRow(it)
                    editSelectedSynchronizer()
                }
            }
            is TopologyGraphPanel.Selection.Mediator -> {
                selectedSynchronizerId(selection)?.let {
                    selectSynchronizerRow(it)
                    editSelectedSynchronizer()
                }
            }
            null -> Messages.showInfoMessage(project, "Select a topology node first.", "Managed Canton Sandboxes")
        }
    }

    private fun removeSelectedTopologyNode() {
        when (val selection = currentTopologySelection) {
            is TopologyGraphPanel.Selection.Participant -> removeParticipantById(selection.id)
            is TopologyGraphPanel.Selection.Synchronizer -> removeSynchronizerById(selection.id)
            is TopologyGraphPanel.Selection.Sequencer -> selectedSynchronizerId(selection)?.let(::removeSynchronizerById)
            is TopologyGraphPanel.Selection.Mediator -> selectedSynchronizerId(selection)?.let(::removeSynchronizerById)
            null -> Messages.showInfoMessage(project, "Select a topology node first.", "Managed Canton Sandboxes")
        }
    }

    private fun showTopologyContextMenu(selection: TopologyGraphPanel.Selection, x: Int, y: Int) {
        currentTopologySelection = selection
        componentPalette.select(selection)
        renderInspector(selection)
        if (selection !is TopologyGraphPanel.Selection.Participant) return
        JPopupMenu().apply {
            add(menuItem("See in Explorer", AllIcons.Actions.ToggleVisibility) {
                showParticipantInExplorer(selection.id)
            })
        }.show(graph, x, y)
    }

    private fun showParticipantInExplorer(participantId: String) {
        if (currentProfile.participant(participantId) == null) return
        saveProfileFields()
        explorerNavigation.showParticipant(
            currentProfile,
            participantId,
            refresh = latestSession.status == SandboxSessionStatus.RUNNING
        )
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(SANDBOX_TOOL_WINDOW_ID) ?: return
        val explorerContent = toolWindow.contentManager.contents
            .firstOrNull { it.displayName == SANDBOX_EXPLORER_CONTENT_NAME }
        toolWindow.activate(Runnable {
            if (explorerContent != null) toolWindow.contentManager.setSelectedContent(explorerContent)
        })
    }

    private fun editGraphConnection() {
        val participants = currentProfile.participants
        val synchronizers = currentProfile.synchronizers
        if (participants.isEmpty() || synchronizers.isEmpty()) return

        val participantCombo = JComboBox(participants.map { it.name }.toTypedArray())
        val syncCombo = JComboBox(synchronizers.map { it.name }.toTypedArray())
        val selectedParticipant = (currentTopologySelection as? TopologyGraphPanel.Selection.Participant)?.id
        selectedParticipant?.let { id ->
            participants.indexOfFirst { it.id == id }.takeIf { it >= 0 }?.let { participantCombo.selectedIndex = it }
        }
        selectedSynchronizerId(currentTopologySelection)?.let { id ->
            synchronizers.indexOfFirst { it.id == id }.takeIf { it >= 0 }?.let { syncCombo.selectedIndex = it }
        }
        val connected = JCheckBox("Connected", true)
        fun refreshConnectionState() {
            val participant = participants.getOrNull(participantCombo.selectedIndex) ?: return
            val sync = synchronizers.getOrNull(syncCombo.selectedIndex) ?: return
            connected.isSelected = currentProfile.bindings
                .firstOrNull { it.participantId == participant.id && it.synchronizerId == sync.id }
                ?.connected ?: false
        }
        participantCombo.addActionListener { refreshConnectionState() }
        syncCombo.addActionListener { refreshConnectionState() }
        refreshConnectionState()

        val form = JPanel(GridBagLayout()).apply {
            addLabeled("Participant", participantCombo, 0)
            addLabeled("Sync domain", syncCombo, 1)
            addLabeled("State", connected, 2)
        }
        if (JOptionPane.showConfirmDialog(this, form, "Edit Connection", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) return
        val participant = participants.getOrNull(participantCombo.selectedIndex) ?: return
        val sync = synchronizers.getOrNull(syncCombo.selectedIndex) ?: return
        val binding = currentProfile.bindings.firstOrNull { it.participantId == participant.id && it.synchronizerId == sync.id }
        if (binding == null) {
            currentProfile.bindings.add(ParticipantSyncBinding(participant.id, sync.id, connected.isSelected))
        } else {
            binding.connected = connected.isSelected
        }
        persistAndRefresh()
        selectTopology(TopologyGraphPanel.Selection.Participant(participant.id))
    }

    private fun updateTopologyPosition(selection: TopologyGraphPanel.Selection, x: Int, y: Int) {
        val nodeId = topologyNodeId(selection)
        currentProfile.topologyPositions.removeIf { it.nodeId == nodeId }
        currentProfile.topologyPositions.add(TopologyNodePosition(nodeId, x.coerceAtLeast(0), y.coerceAtLeast(0)))
        profiles.upsert(currentProfile)
        graph.setProfile(currentProfile)
        currentTopologySelection = selection
        graph.select(selection)
        graph.setSelectionDetails(null)
        componentPalette.select(selection)
    }

    private fun autoArrangeTopology() {
        val selection = currentTopologySelection
        currentProfile.topologyPositions.clear()
        profiles.upsert(currentProfile)
        graph.setProfile(currentProfile)
        renderProfileTables()
        selectTopology(selection)
    }

    private fun setGraphConnection(participantId: String, synchronizerId: String, connected: Boolean) {
        val binding = currentProfile.bindings.firstOrNull {
            it.participantId == participantId && it.synchronizerId == synchronizerId
        }
        if (binding == null) {
            currentProfile.bindings.add(ParticipantSyncBinding(participantId, synchronizerId, connected))
        } else {
            binding.connected = connected
        }
        profiles.upsert(currentProfile)
        renderProfileTables()
        selectTopology(TopologyGraphPanel.Selection.Participant(participantId))
    }

    private fun editSelectedParticipant() {
        val row = participantTable.selectedRow
        val participant = currentProfile.participants.getOrNull(row) ?: return
        val name = JBTextField(participant.name)
        val ledgerPort = JBTextField(participant.ledgerPort.toString())
        val adminPort = JBTextField(participant.adminPort.toString())
        val jsonPort = JBTextField(participant.jsonPort.toString())
        val form = JPanel(GridBagLayout()).apply {
            addLabeled("Name", name, 0)
            addLabeled("Ledger port", ledgerPort, 1)
            addLabeled("Admin port", adminPort, 2)
            addLabeled("JSON port", jsonPort, 3)
        }
        if (JOptionPane.showConfirmDialog(this, form, "Edit Participant", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) return
        val newName = name.text.trim()
        val ports = listOf(ledgerPort.text.toIntOrNull(), adminPort.text.toIntOrNull(), jsonPort.text.toIntOrNull())
        if (!isCantonIdentifier(newName) || ports.any { it == null || it !in 1..65535 }) {
            Messages.showErrorDialog(project, "Use a Canton identifier for the name and valid TCP ports.", "Invalid Participant")
            return
        }
        if (currentProfile.participants.any { it.id != participant.id && it.name == newName }) {
            Messages.showErrorDialog(project, "Another participant already uses '$newName'.", "Duplicate Participant")
            return
        }
        participant.name = newName
        participant.ledgerPort = ports[0]!!
        participant.adminPort = ports[1]!!
        participant.jsonPort = ports[2]!!
        persistAndRefresh()
    }

    private fun addSynchronizer() {
        val next = currentProfile.synchronizers.size + 1
        val sync = SandboxDefaults.synchronizer(next, currentProfile.portBase)
        currentProfile.synchronizers.add(sync)
        currentProfile.participants.forEach { currentProfile.bindings.add(ParticipantSyncBinding(it.id, sync.id, true)) }
        persistAndRefresh()
    }

    private fun editSelectedSynchronizer() {
        val row = syncTable.selectedRow
        val sync = currentProfile.synchronizers.getOrNull(row) ?: return
        val name = JBTextField(sync.name)
        val sequencerName = JBTextField(sync.sequencer.name)
        val sequencerPublic = JBTextField(sync.sequencer.publicPort.toString())
        val sequencerAdmin = JBTextField(sync.sequencer.adminPort.toString())
        val mediatorName = JBTextField(sync.mediator.name)
        val mediatorAdmin = JBTextField(sync.mediator.adminPort.toString())
        val form = JPanel(GridBagLayout()).apply {
            addLabeled("Sync domain", name, 0)
            addLabeled("Sequencer", sequencerName, 1)
            addLabeled("Sequencer public", sequencerPublic, 2)
            addLabeled("Sequencer admin", sequencerAdmin, 3)
            addLabeled("Mediator", mediatorName, 4)
            addLabeled("Mediator admin", mediatorAdmin, 5)
        }
        if (JOptionPane.showConfirmDialog(this, form, "Edit Sync Domain", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) return
        val newName = name.text.trim()
        val newSequencer = sequencerName.text.trim()
        val newMediator = mediatorName.text.trim()
        val ports = listOf(sequencerPublic.text.toIntOrNull(), sequencerAdmin.text.toIntOrNull(), mediatorAdmin.text.toIntOrNull())
        if (listOf(newName, newSequencer, newMediator).any { !isCantonIdentifier(it) } || ports.any { it == null || it !in 1..65535 }) {
            Messages.showErrorDialog(project, "Use Canton identifiers for names and valid TCP ports.", "Invalid Sync Domain")
            return
        }
        if (currentProfile.synchronizers.any { it.id != sync.id && it.name == newName }) {
            Messages.showErrorDialog(project, "Another sync domain already uses '$newName'.", "Duplicate Sync Domain")
            return
        }
        val nodeNames = currentProfile.synchronizers
            .filter { it.id != sync.id }
            .flatMap { listOf(it.sequencer.name, it.mediator.name) }
        if (newSequencer in nodeNames || newMediator in nodeNames || newSequencer == newMediator) {
            Messages.showErrorDialog(project, "Sequencer and mediator names must be unique.", "Duplicate Node")
            return
        }
        sync.name = newName
        sync.sequencer.name = newSequencer
        sync.sequencer.publicPort = ports[0]!!
        sync.sequencer.adminPort = ports[1]!!
        sync.mediator.name = newMediator
        sync.mediator.adminPort = ports[2]!!
        persistAndRefresh()
    }

    private fun removeParticipantById(id: String) {
        if (currentProfile.participants.size <= 1) {
            Messages.showErrorDialog(project, "A sandbox needs at least one participant.", "Cannot Remove Participant")
            return
        }
        currentProfile.participants.removeIf { it.id == id }
        currentProfile.bindings.removeIf { it.participantId == id }
        currentProfile.darAssignments.forEach { it.participantIds.removeIf { pid -> pid == id } }
        currentProfile.partyAllocations.removeIf { it.participantId == id }
        persistAndRefresh()
    }

    private fun removeSynchronizerById(id: String) {
        if (SandboxDefaults.isSharedSynchronizer(id, currentProfile.synchronizer(id)?.name ?: id)) {
            Messages.showErrorDialog(
                project,
                "The global sync domain is the default shared route for cross-participant workflows. You can disconnect participants from it, but it cannot be removed.",
                "Cannot Remove Global Sync Domain"
            )
            return
        }
        if (currentProfile.synchronizers.size <= 1) {
            Messages.showErrorDialog(project, "A sandbox needs at least one sync domain.", "Cannot Remove Sync Domain")
            return
        }
        currentProfile.synchronizers.removeIf { it.id == id }
        currentProfile.bindings.removeIf { it.synchronizerId == id }
        currentProfile.partyAllocations.removeIf { it.synchronizerId == id }
        persistAndRefresh()
    }

    private fun selectParticipantRow(id: String) {
        val index = currentProfile.participants.indexOfFirst { it.id == id }
        if (index >= 0) {
            withoutTableNavigation {
                participantTable.selectionModel.setSelectionInterval(index, index)
            }
        }
    }

    private fun selectSynchronizerRow(id: String) {
        val index = currentProfile.synchronizers.indexOfFirst { it.id == id }
        if (index >= 0) {
            withoutTableNavigation {
                syncTable.selectionModel.setSelectionInterval(index, index)
            }
        }
    }

    private fun withoutTableNavigation(action: () -> Unit) {
        val previous = suppressTableNavigation
        suppressTableNavigation = true
        try {
            action()
        } finally {
            suppressTableNavigation = previous
        }
    }

    private fun selectedSynchronizerId(selection: TopologyGraphPanel.Selection?): String? =
        when (selection) {
            is TopologyGraphPanel.Selection.Synchronizer -> selection.id
            is TopologyGraphPanel.Selection.Sequencer -> currentProfile.synchronizers.firstOrNull { it.sequencer.id == selection.id }?.id
            is TopologyGraphPanel.Selection.Mediator -> currentProfile.synchronizers.firstOrNull { it.mediator.id == selection.id }?.id
            else -> null
        }

    private fun topologyNodeId(selection: TopologyGraphPanel.Selection): String =
        when (selection) {
            is TopologyGraphPanel.Selection.Participant -> selection.id
            is TopologyGraphPanel.Selection.Synchronizer -> selection.id
            is TopologyGraphPanel.Selection.Sequencer -> selection.id
            is TopologyGraphPanel.Selection.Mediator -> selection.id
        }

    private fun rebasePorts() {
        val base = portBaseField.text.toIntOrNull() ?: return
        currentProfile.portBase = base
        currentProfile.participants = currentProfile.participants.mapIndexed { index, old ->
            SandboxDefaults.participant(index + 1, base).also {
                it.id = old.id
                it.name = old.name
            }
        }.toMutableList()
        currentProfile.synchronizers = currentProfile.synchronizers.mapIndexed { index, old ->
            SandboxDefaults.synchronizer(index + 1, base).also {
                it.id = old.id
                it.name = old.name
            }
        }.toMutableList()
        persistAndRefresh()
    }

    private fun refreshDars() {
        ApplicationManager.getApplication().executeOnPooledThread {
            latestDars = darDiscovery.discover(currentProfile)
            SwingUtilities.invokeLater { renderDars() }
        }
    }

    private fun addDarFromChooser() {
        val descriptor = FileChooserDescriptor(true, false, false, false, false, true).withFileFilter {
            it.extension == "dar"
        }
        val files = FileChooser.chooseFiles(descriptor, project, null)
        files.forEach { file ->
            if (currentProfile.darAssignments.none { it.darPath == file.path }) {
                currentProfile.darAssignments.add(DarAssignment(file.path, currentProfile.participants.map { it.id }.toMutableList()))
            }
        }
        persistAndRefresh()
        refreshDars()
    }

    private fun assignDar(path: String, participantIds: List<String>) {
        val assignment = currentProfile.darAssignments.firstOrNull { it.darPath == path }
        if (assignment == null) {
            currentProfile.darAssignments.add(DarAssignment(path, participantIds.toMutableList()))
        } else {
            assignment.participantIds = participantIds.toMutableList()
        }
        persistAndRefresh()
    }

    private fun selectedDarPath(): String? {
        val row = darTable.selectedRow
        if (row >= 0) return darTable.getValueAt(row, 0) as? String
        return null
    }

    private fun removeSelectedPartyAllocation() {
        val row = partyTable.selectedRow
        if (row < 0) return
        currentProfile.partyAllocations.getOrNull(row)?.let { currentProfile.partyAllocations.remove(it) }
        persistAndRefresh()
    }

    private fun renderProfileTables() {
        reset(participantModel)
        currentProfile.participants.forEach { participantModel.addRow(rowData(it.name, it.ledgerPort, it.adminPort, it.jsonPort)) }
        reset(syncModel)
        currentProfile.synchronizers.forEach {
            syncModel.addRow(rowData(it.name, it.sequencer.name, it.sequencer.publicPort, it.sequencer.adminPort, it.mediator.name, it.mediator.adminPort))
        }
        reset(connectionModel)
        currentProfile.bindings.forEach {
            connectionModel.addRow(rowData(currentProfile.participant(it.participantId)?.name.orEmpty(), currentProfile.synchronizer(it.synchronizerId)?.name.orEmpty(), it.connected))
        }
        reset(partyModel)
        currentProfile.partyAllocations.forEach {
            partyModel.addRow(rowData(currentProfile.participant(it.participantId)?.name.orEmpty(), currentProfile.synchronizer(it.synchronizerId)?.name.orEmpty(), it.partyHint))
        }
        renderDars()
        graph.setProfile(currentProfile)
        renderPalette()
        refreshDarParticipantList()
        refreshPartyCombos()
    }

    private fun renderPalette() {
        componentPalette.setProfile(currentProfile)
        componentPalette.select(currentTopologySelection)
    }

    private fun renderDars() {
        reset(darModel)
        val dars = (latestDars + currentProfile.darAssignments.map { DarMetadata(path = it.darPath, name = Path.of(it.darPath).fileName.toString()) })
            .distinctBy { it.path }
            .sortedBy { it.path }
        dars.forEach { dar ->
            val assigned = currentProfile.darAssignments.firstOrNull { it.darPath == dar.path }
                ?.participantIds
                ?.mapNotNull { currentProfile.participant(it)?.name }
                ?.joinToString(", ")
                .orEmpty()
            darModel.addRow(rowData(dar.path, dar.name, dar.version, dar.mainPackageId, assigned, dar.inspectError.ifBlank { "ok" }))
        }
    }

    private fun refreshDarParticipantList() {
        val model = darParticipantList.model as DefaultListModel<String>
        val selected = darParticipantList.selectedValuesList.toSet()
        model.clear()
        currentProfile.participants.forEach { model.addElement(it.name) }
        val selectedIndices = currentProfile.participants
            .mapIndexedNotNull { index, participant -> index.takeIf { participant.name in selected } }
            .toIntArray()
        darParticipantList.selectedIndices = selectedIndices
    }

    private fun refreshPartyCombos() {
        val participantSelection = partyParticipantCombo.selectedItem as? String
        val syncSelection = partySyncCombo.selectedItem as? String
        val participants = currentProfile.participants.map { it.name }
        val synchronizers = currentProfile.synchronizers.map { it.name }
        partyParticipantCombo.model = DefaultComboBoxModel(participants.toTypedArray())
        partySyncCombo.model = DefaultComboBoxModel(synchronizers.toTypedArray())
        participantSelection?.takeIf { it in participants }?.let { partyParticipantCombo.selectedItem = it }
        syncSelection?.takeIf { it in synchronizers }?.let { partySyncCombo.selectedItem = it }
    }

    private fun renderSession(state: SandboxSessionState) {
        renderLog(state.log)
        logArea.caretPosition = logArea.document.length
        val belongsToCurrentProfile = state.profileId.isBlank() || state.profileId == currentProfile.id
        val effectiveState = if (belongsToCurrentProfile) {
            state
        } else {
            state.copy(status = SandboxSessionStatus.STOPPED, health = emptyList(), message = "No running session for this profile")
        }
        graph.setRuntimeState(
            effectiveState.status,
            effectiveState.health,
            if (belongsToCurrentProfile) state.log.hashCode() else 0
        )
        renderInspector(currentTopologySelection)
    }

    private fun renderInspector(selection: TopologyGraphPanel.Selection?) {
        val text = when (selection) {
            is TopologyGraphPanel.Selection.Participant -> currentProfile.participant(selection.id)?.let { participant ->
                participantInspectorText(currentProfile, participant, healthLine(participant.id))
            }
            is TopologyGraphPanel.Selection.Synchronizer -> currentProfile.synchronizer(selection.id)?.let { sync ->
                """
                |${TopologyNodeIcons.SYNCHRONIZER} Sync Domain - ${sync.name}
                |
                |Sequencer: ${sync.sequencer.name}
                |Mediator: ${sync.mediator.name}
                |
                |Connected participants:
                |${currentProfile.bindings.filter { it.synchronizerId == sync.id && it.connected }.mapNotNull { currentProfile.participant(it.participantId)?.name }.joinToString("\n").ifBlank { "None" }}
                |""".trimMargin()
            }
            is TopologyGraphPanel.Selection.Sequencer -> currentProfile.synchronizers.firstOrNull { it.sequencer.id == selection.id }?.sequencer?.let {
                "${TopologyNodeIcons.SEQUENCER} Sequencer - ${it.name}\n\nPublic API: grpc://127.0.0.1:${it.publicPort}\nAdmin API: grpc://127.0.0.1:${it.adminPort}"
            }
            is TopologyGraphPanel.Selection.Mediator -> currentProfile.synchronizers.firstOrNull { it.mediator.id == selection.id }?.mediator?.let {
                "${TopologyNodeIcons.MEDIATOR} Mediator - ${it.name}\n\nAdmin API: grpc://127.0.0.1:${it.adminPort}"
            }
            null -> null
        }
        graph.setSelectionDetails(text)
    }

    private fun selectTopology(selection: TopologyGraphPanel.Selection?) {
        currentTopologySelection = selection
        graph.select(selection)
        componentPalette.select(selection)
        renderInspector(selection)
    }

    private fun healthLine(participantId: String): String {
        if (latestSession.profileId.isNotBlank() && latestSession.profileId != currentProfile.id) return "not checked"
        val snapshot = latestSession.health.firstOrNull { it.endpoint.nodeId == participantId && it.endpoint.kind == "json" }
            ?: return "not checked"
        return "live=${snapshot.live.statusText()} ready=${snapshot.ready.statusText()}"
    }

    private fun Boolean.statusText(): String = if (this) "ok" else "down"

    private fun wireTableNavigation() {
        participantTable.selectionModel.addListSelectionListener {
            if (!it.valueIsAdjusting && !suppressTableNavigation) {
                currentProfile.participants.getOrNull(participantTable.selectedRow)?.let { participant ->
                    selectTopology(TopologyGraphPanel.Selection.Participant(participant.id))
                }
            }
        }
        syncTable.selectionModel.addListSelectionListener {
            if (!it.valueIsAdjusting && !suppressTableNavigation) {
                currentProfile.synchronizers.getOrNull(syncTable.selectedRow)?.let { sync ->
                    selectTopology(TopologyGraphPanel.Selection.Synchronizer(sync.id))
                }
            }
        }
        participantTable.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) editSelectedParticipant()
            }
        })
        syncTable.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) editSelectedSynchronizer()
            }
        })
    }

    private fun styleNetworkControls() {
        listOf(nameField, portBaseField, partyField).forEach(::styleTextField)
        listOf(partyParticipantCombo, partySyncCombo).forEach(::styleComboBox)
        styleList(darParticipantList)
    }

    private fun styledTabbedPane(): JTabbedPane =
        JTabbedPane().apply {
            background = TopologyGraphTheme.canvas
            foreground = TopologyGraphTheme.text
            border = BorderFactory.createEmptyBorder()
        }

    private fun networkSurface(content: JComponent): JComponent =
        networkPanel(BorderLayout()).apply {
            add(content, BorderLayout.CENTER)
        }

    private fun networkPanel(layout: LayoutManager): JPanel =
        JPanel(layout).apply {
            background = TopologyGraphTheme.canvas
            foreground = TopologyGraphTheme.text
        }

    private fun networkCard(content: JComponent): JPanel =
        JPanel(BorderLayout()).apply {
            background = TopologyGraphTheme.panel
            foreground = TopologyGraphTheme.text
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(TopologyGraphTheme.panelBorder),
                JBUI.Borders.empty(10)
            )
            add(content, BorderLayout.CENTER)
        }

    private fun networkCardTitle(text: String): JLabel =
        JLabel(text).apply {
            foreground = TopologyGraphTheme.text
            font = font.deriveFont(Font.BOLD, 13f)
        }

    private fun networkLabel(text: String): JLabel =
        JLabel(text).apply {
            foreground = TopologyGraphTheme.detail
            border = JBUI.Borders.emptyRight(2)
            font = font.deriveFont(Font.PLAIN, 12f)
        }

    private fun themedScrollPane(component: JComponent): JBScrollPane =
        JBScrollPane(component).apply {
            border = BorderFactory.createLineBorder(TopologyGraphTheme.panelBorder)
            background = TopologyGraphTheme.panel
            viewport.background = TopologyGraphTheme.panel
            horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED
            verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
        }

    private fun styleTextField(field: JBTextField) {
        field.foreground = TopologyGraphTheme.text
        field.background = TopologyGraphTheme.panel
        field.caretColor = TopologyGraphTheme.hover
        field.isOpaque = false
        field.border = BorderFactory.createCompoundBorder(
            NetworkRoundBorder(TopologyGraphTheme.panelBorder, 12),
            JBUI.Borders.empty(4, 9)
        )
    }

    private fun compactToolbarControl(component: JComponent) {
        val width = component.preferredSize.width.coerceAtLeast(34)
        val size = Dimension(width, 34)
        component.preferredSize = size
        component.minimumSize = Dimension(32, 34)
        component.maximumSize = Dimension(Int.MAX_VALUE, 34)
    }

    private fun styleComboBox(combo: JComboBox<String>) {
        combo.foreground = TopologyGraphTheme.text
        combo.background = TopologyGraphTheme.panel
        combo.border = BorderFactory.createLineBorder(TopologyGraphTheme.panelBorder)
        combo.renderer = NetworkListCellRenderer()
    }

    private fun styleList(list: JList<String>) {
        list.background = TopologyGraphTheme.panel
        list.foreground = TopologyGraphTheme.text
        list.selectionBackground = networkAlpha(TopologyGraphTheme.selected, 90)
        list.selectionForeground = TopologyGraphTheme.text
        list.fixedCellHeight = 28
        list.cellRenderer = NetworkListCellRenderer()
    }

    private fun renderLog(log: String) {
        val document = logArea.styledDocument
        document.remove(0, document.length)
        val lines = if (log.isEmpty()) listOf("") else log.split('\n')
        for ((index, line) in lines.withIndex()) {
            val attributes = SimpleAttributeSet().apply {
                StyleConstants.setForeground(this, networkLogLineColor(line))
                StyleConstants.setFontFamily(this, Font.MONOSPACED)
                StyleConstants.setFontSize(this, 12)
            }
            document.insertString(document.length, line + if (index < lines.lastIndex) "\n" else "", attributes)
        }
    }

    private fun table(model: DefaultTableModel): JBTable =
        JBTable(model).apply {
            setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
            autoResizeMode = JTable.AUTO_RESIZE_ALL_COLUMNS
            rowHeight = 30
            intercellSpacing = Dimension(0, 0)
            gridColor = networkAlpha(TopologyGraphTheme.panelBorder, 150)
            showHorizontalLines = true
            showVerticalLines = true
            background = TopologyGraphTheme.panel
            foreground = TopologyGraphTheme.text
            selectionBackground = networkAlpha(TopologyGraphTheme.selected, 90)
            selectionForeground = TopologyGraphTheme.text
            setDefaultRenderer(Object::class.java, NetworkTableCellRenderer())
            styleTableHeader(tableHeader)
        }

    private fun tableModel(vararg columns: String): DefaultTableModel =
        object : DefaultTableModel(columns, 0) {
            override fun isCellEditable(row: Int, column: Int): Boolean = false
        }

    private fun reset(model: DefaultTableModel) {
        model.rowCount = 0
    }

    private fun JPanel.addLabeled(label: String, component: JComponent, y: Int) {
        val labelConstraints = GridBagConstraints().apply {
            gridx = 0
            gridy = y
            anchor = GridBagConstraints.WEST
            insets = java.awt.Insets(2, 2, 2, 6)
        }
        val fieldConstraints = GridBagConstraints().apply {
            gridx = 1
            gridy = y
            fill = GridBagConstraints.HORIZONTAL
            weightx = 1.0
            insets = java.awt.Insets(2, 2, 2, 2)
        }
        add(JLabel(label), labelConstraints)
        add(component, fieldConstraints)
    }

    private fun styleTableHeader(header: JTableHeader) {
        header.background = TopologyGraphTheme.canvas
        header.foreground = TopologyGraphTheme.warning
        header.font = header.font.deriveFont(Font.BOLD, 12f)
        header.border = BorderFactory.createMatteBorder(0, 0, 1, 0, TopologyGraphTheme.panelBorder)
        header.defaultRenderer = NetworkTableHeaderRenderer(header.defaultRenderer)
    }

    private fun row(vararg components: JComponent): JPanel =
        JPanel(FlowLayout(FlowLayout.LEFT, 6, 2)).apply {
            background = TopologyGraphTheme.canvas
            foreground = TopologyGraphTheme.text
            components.forEach(::add)
        }

    private fun button(text: String, icon: javax.swing.Icon? = null, action: () -> Unit): JButton =
        NetworkButton(text, icon).apply {
            toolTipText = text
            addActionListener { action() }
        }

    private fun popupButton(text: String, builder: (JPopupMenu) -> Unit): JButton =
        NetworkButton(text, null).apply {
            toolTipText = text
            addActionListener {
                val popup = JPopupMenu().apply {
                    background = TopologyGraphTheme.panel
                    border = BorderFactory.createLineBorder(TopologyGraphTheme.panelBorder)
                }
                builder(popup)
                popup.show(this, 0, height)
            }
        }

    private fun menuItem(text: String, icon: javax.swing.Icon? = null, action: () -> Unit): JMenuItem =
        JMenuItem(text, icon).apply {
            isOpaque = true
            background = TopologyGraphTheme.panel
            foreground = TopologyGraphTheme.text
            border = JBUI.Borders.empty(5, 10)
            addActionListener { action() }
        }

    private fun rowData(vararg values: Any?): Array<Any?> = arrayOf(*values)

    private fun isCantonIdentifier(value: String): Boolean =
        value.matches(Regex("[A-Za-z][A-Za-z0-9_]*"))

    override fun dispose() {
        sessionListener?.dispose()
        sessionListener = null
    }
}

internal fun participantInspectorText(
    profile: SandboxProfile,
    participant: ParticipantNode,
    health: String
): String {
    val uploadedDars = profile.assignedDarFileNames(participant.id)
    val darLines = when {
        uploadedDars.isNotEmpty() -> uploadedDars.joinToString("\n")
        profile.hasUploadedDarAssignments() -> "! No DARs assigned to this participant."
        else -> "! No DARs assigned to any participant."
    }
    val parties = profile.partyAllocations
        .filter { it.participantId == participant.id }
        .joinToString("\n") { it.partyHint }
    return """
        |${TopologyNodeIcons.PARTICIPANT} Participant - ${participant.name}
        |
        |Uploaded DARs:
        |$darLines
        |
        |Ledger API: grpc://127.0.0.1:${participant.ledgerPort}
        |Admin API: grpc://127.0.0.1:${participant.adminPort}
        |JSON API: http://127.0.0.1:${participant.jsonPort}
        |Health: $health
        |
        |Connected sync domains:
        |${profile.connectedSynchronizers(participant.id).joinToString("\n") { it.name }.ifBlank { "None" }}
        |
        |Parties:
        |${parties.ifBlank { "None allocated" }}
        |""".trimMargin()
}

internal fun networkParticipantColor(): Color = TopologyGraphTheme.participantBorder

internal fun networkSyncColor(name: String): Color =
    if (name == SandboxDefaults.SHARED_SYNCHRONIZER_NAME) TopologyGraphTheme.globalSyncBorder else TopologyGraphTheme.syncBorder

internal fun networkConnectionColor(connected: Boolean): Color =
    if (connected) TopologyGraphTheme.syncBorder else Color(0xFF5C7A)

internal fun networkDarInspectColor(inspect: String): Color =
    if (inspect.equals("ok", ignoreCase = true)) TopologyGraphTheme.syncBorder else TopologyGraphTheme.warning

internal fun networkLogLineColor(line: String): Color {
    val lower = line.lowercase()
    return when {
        "error" in lower || "exception" in lower || "failed" in lower -> Color(0xFF5C7A)
        "warn" in lower || "warning" in lower -> TopologyGraphTheme.warning
        "ready" in lower || "running" in lower || "serving" in lower || "started" in lower -> TopologyGraphTheme.syncBorder
        else -> TopologyGraphTheme.detail
    }
}

private fun networkAlpha(color: Color, alpha: Int): Color =
    Color(color.red, color.green, color.blue, alpha.coerceIn(0, 255))

private class NetworkTableHeaderRenderer(
    private val delegate: javax.swing.table.TableCellRenderer
) : javax.swing.table.TableCellRenderer {
    override fun getTableCellRendererComponent(
        table: JTable,
        value: Any?,
        isSelected: Boolean,
        hasFocus: Boolean,
        row: Int,
        column: Int
    ): Component =
        delegate.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column).apply {
            background = TopologyGraphTheme.canvas
            foreground = TopologyGraphTheme.warning
            font = font.deriveFont(Font.BOLD, 12f)
            if (this is JComponent) {
                isOpaque = true
                border = JBUI.Borders.empty(0, 10)
            }
            if (this is JLabel) {
                horizontalAlignment = SwingConstants.LEFT
            }
        }
}

private class NetworkTableCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(
        table: JTable,
        value: Any?,
        isSelected: Boolean,
        hasFocus: Boolean,
        row: Int,
        column: Int
    ): Component {
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
        val modelColumn = table.convertColumnIndexToModel(column)
        val columnName = table.model.getColumnName(modelColumn)
        val textValue = value?.toString().orEmpty()

        isOpaque = true
        border = JBUI.Borders.empty(0, 10)
        horizontalAlignment = SwingConstants.LEFT
        font = table.font.deriveFont(Font.PLAIN)
        background = if (isSelected) networkAlpha(TopologyGraphTheme.selected, 105) else TopologyGraphTheme.panel
        foreground = TopologyGraphTheme.text

        when (columnName) {
            "Participant" -> {
                foreground = networkParticipantColor()
                font = font.deriveFont(Font.BOLD)
            }
            "Sync Domain" -> {
                foreground = networkSyncColor(textValue)
                font = font.deriveFont(Font.BOLD)
            }
            "Connected" -> {
                val connected = value == true || textValue.equals("true", ignoreCase = true) || textValue.equals("connected", ignoreCase = true)
                text = if (connected) "connected" else "disconnected"
                foreground = networkConnectionColor(connected)
                background = if (isSelected) networkAlpha(TopologyGraphTheme.selected, 105) else networkAlpha(networkConnectionColor(connected), 34)
                border = BorderFactory.createCompoundBorder(
                    BorderFactory.createMatteBorder(4, 8, 4, 8, TopologyGraphTheme.panel),
                    BorderFactory.createLineBorder(networkAlpha(networkConnectionColor(connected), 165))
                )
                horizontalAlignment = SwingConstants.CENTER
            }
            "Inspect" -> {
                foreground = networkDarInspectColor(textValue)
                text = textValue.ifBlank { "not inspected" }
                font = font.deriveFont(if (text.equals("ok", ignoreCase = true)) Font.PLAIN else Font.BOLD)
            }
            "DAR", "Main Package" -> {
                foreground = TopologyGraphTheme.detail
                font = Font(Font.MONOSPACED, Font.PLAIN, 12)
            }
            "Ledger", "Admin", "JSON", "Seq Public", "Seq Admin", "Med Admin" -> {
                foreground = TopologyGraphTheme.detail
                horizontalAlignment = SwingConstants.RIGHT
            }
            "Assigned Participants" -> foreground = TopologyGraphTheme.participantBorder
            "Party Hint" -> foreground = TopologyGraphTheme.warning
            "Name", "Version", "Sequencer", "Mediator" -> foreground = TopologyGraphTheme.text
        }
        return this
    }
}

private class NetworkListCellRenderer : DefaultListCellRenderer() {
    override fun getListCellRendererComponent(
        list: JList<*>,
        value: Any?,
        index: Int,
        isSelected: Boolean,
        cellHasFocus: Boolean
    ): Component {
        super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
        isOpaque = true
        border = JBUI.Borders.empty(4, 10)
        background = if (isSelected) networkAlpha(TopologyGraphTheme.selected, 90) else TopologyGraphTheme.panel
        foreground = if (isSelected) TopologyGraphTheme.text else TopologyGraphTheme.participantBorder
        font = font.deriveFont(if (isSelected) Font.BOLD else Font.PLAIN)
        return this
    }
}

private class NetworkButton(text: String, icon: javax.swing.Icon?) : JButton(text, icon) {
    init {
        foreground = TopologyGraphTheme.text
        background = TopologyGraphTheme.panel
        isOpaque = false
        isContentAreaFilled = false
        isBorderPainted = false
        isFocusPainted = false
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        border = JBUI.Borders.empty(5, 11)
        margin = Insets(0, 0, 0, 0)
        horizontalAlignment = SwingConstants.CENTER
    }

    override fun getPreferredSize(): Dimension {
        val size = super.getPreferredSize()
        return Dimension(size.width.coerceAtLeast(34), 34)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = when {
                model.isPressed -> networkAlpha(TopologyGraphTheme.selected, 70)
                model.isRollover -> networkAlpha(TopologyGraphTheme.hover, 34)
                else -> TopologyGraphTheme.panel
            }
            g2.fillRoundRect(0, 0, width - 1, height - 1, 14, 14)
            g2.color = if (model.isRollover) TopologyGraphTheme.hover else TopologyGraphTheme.panelBorder
            g2.drawRoundRect(0, 0, width - 1, height - 1, 14, 14)
        } finally {
            g2.dispose()
        }
        super.paintComponent(g)
    }
}

private class NetworkRoundBorder(
    private val color: Color,
    private val radius: Int
) : javax.swing.border.AbstractBorder() {
    override fun getBorderInsets(c: Component): Insets = Insets(1, 1, 1, 1)

    override fun getBorderInsets(c: Component, insets: Insets): Insets {
        insets.set(1, 1, 1, 1)
        return insets
    }

    override fun paintBorder(c: Component, g: Graphics, x: Int, y: Int, width: Int, height: Int) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = color
            g2.drawRoundRect(x, y, width - 1, height - 1, radius, radius)
        } finally {
            g2.dispose()
        }
    }
}

private class TopologySplitPaneUI : BasicSplitPaneUI() {
    override fun createDefaultDivider(): BasicSplitPaneDivider =
        object : BasicSplitPaneDivider(this) {
            init {
                border = BorderFactory.createEmptyBorder()
                background = TopologyGraphTheme.canvas
            }

            override fun getPreferredSize(): Dimension = Dimension(8, 8)

            override fun paint(g: Graphics) {
                val g2 = g.create() as Graphics2D
                try {
                    g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                    g2.color = TopologyGraphTheme.canvas
                    g2.fillRect(0, 0, width, height)

                    if (height >= width) {
                        val center = width / 2
                        g2.color = dividerAlpha(TopologyGraphTheme.panelBorder, 170)
                        g2.fillRoundRect(center - 3, 0, 6, height, 6, 6)
                        g2.color = dividerAlpha(TopologyGraphTheme.participantBorder, 105)
                        g2.fillRoundRect(center - 1, 8, 2, height - 16, 4, 4)
                        g2.color = dividerAlpha(TopologyGraphTheme.hover, 55)
                        g2.drawLine(center + 2, 12, center + 2, height - 12)
                    } else {
                        val center = height / 2
                        g2.color = dividerAlpha(TopologyGraphTheme.panelBorder, 170)
                        g2.fillRoundRect(0, center - 3, width, 6, 6, 6)
                        g2.color = dividerAlpha(TopologyGraphTheme.participantBorder, 105)
                        g2.fillRoundRect(8, center - 1, width - 16, 2, 4, 4)
                        g2.color = dividerAlpha(TopologyGraphTheme.hover, 55)
                        g2.drawLine(12, center + 2, width - 12, center + 2)
                    }
                } finally {
                    g2.dispose()
                }
            }
        }
}

private fun dividerAlpha(color: Color, alpha: Int): Color =
    Color(color.red, color.green, color.blue, alpha.coerceIn(0, 255))
