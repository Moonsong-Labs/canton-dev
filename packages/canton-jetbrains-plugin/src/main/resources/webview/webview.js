// Adapted from https://github.com/digital-asset/daml/blob/main/sdk/compiler/daml-extension/src/webview.js
// Copyright (c) 2025 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// JCEF host bridges window.jbBridge to the JetBrains plugin. This file replaces
// VSCode's acquireVsCodeApi() with a thin shim that posts to jbBridge.

const vscode = {
  postMessage: function (msg) {
    if (typeof window.jbBridge !== 'undefined' && typeof window.jbBridge.postMessage === 'function') {
      try {
        window.jbBridge.postMessage(JSON.stringify(msg));
        return;
      } catch (e) {
        console.error('jbBridge.postMessage failed', e);
      }
    }
    console.log('msg (no bridge):', msg);
  }
};

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'txTree', label: 'Tx Tree' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'console', label: 'Console' },
  { id: 'raw', label: 'Raw' }
];

const CONSOLE_SELECTOR = [
  '[data-console]',
  '[data-note]',
  '.note',
  '.script-note',
  '.scriptNote',
  '.debug',
  '.trace',
  '.log',
  '.logs',
  '.console',
  '.message',
  '.output',
  'pre'
].join(',');

const state = {
  selectedView: 'overview',
  showArchived: false,
  showDetailedDisclosure: false,
  search: '',
  originalHtml: '',
  sanitizedHtml: '',
  model: emptyModel(),
  notes: [],
  progressMs: -1,
  selectedContractId: null,
  selectedTransactionId: null,
  parserWarnings: []
};

function emptyModel() {
  return {
    contracts: [],
    templates: [],
    parties: [],
    transactions: [],
    consoleEntries: [],
    rawTransactionHtml: '',
    warnings: []
  };
}

function normalizeView(value) {
  if (value === 'table') return 'contracts';
  if (value === 'transaction') return 'txTree';
  return VIEWS.some(v => v.id === value) ? value : 'overview';
}

function setHtmlContent(html) {
  document.body.classList.remove('empty');
  state.progressMs = -1;
  state.originalHtml = String(html == null ? '' : html);
  const fragment = sanitizeToFragment(state.originalHtml);
  state.sanitizedHtml = fragmentToHtml(fragment.cloneNode(true));
  state.model = buildModelFromFragment(fragment.cloneNode(true));
  state.parserWarnings = state.model.warnings.slice();
  if (!state.selectedContractId && state.model.contracts.length > 0) {
    state.selectedContractId = state.model.contracts[0].id;
  }
  if (!state.selectedTransactionId && state.model.transactions.length > 0) {
    state.selectedTransactionId = state.model.transactions[0].id;
  }
  render();
}

function setProgress(millisecondsPassed) {
  const ms = Number(millisecondsPassed);
  state.progressMs = Number.isFinite(ms) && ms >= 0 ? ms : -1;
  renderToolbarState();
}

function setIdeTheme(theme) {
  const dark = theme === 'ide-dark' || theme === 'dark';
  document.body.classList.toggle('ide-dark', dark);
  document.body.classList.toggle('ide-light', !dark);
}

function addConsoleNote(html) {
  const note = consoleEntryFromHtml(html, 'server-note');
  if (!note) return;
  note.id = 'note-' + (state.notes.length + 1);
  state.notes.push(note);
  document.body.classList.remove('hide_note');
  render();
}

// Strips <script> tags, on* event handlers, and javascript:/data: URIs from server-pushed
// HTML before insertion. Defense in depth alongside the page-level CSP: both must agree
// to allow execution.
function sanitizeToFragment(html) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = String(html == null ? '' : html);
  const rawSource = tmpl.content.querySelector('body') || tmpl.content;
  const source = document.createDocumentFragment();
  while (rawSource.firstChild) source.appendChild(rawSource.firstChild);
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT);
  const drop = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'meta' || tag === 'link' || tag === 'style') {
      drop.push(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^(javascript|data|vbscript):/i.test(value.trim())) {
        el.removeAttribute(attr.name);
      }
    }
  }
  drop.forEach(el => el.remove());
  removeEmbeddedToolbar(source);
  pruneEmptyText(source);
  return source;
}

function removeEmbeddedToolbar(root) {
  const embeddedControlSelector = ['#show_archived', '#show_detailed_disclosure', 'button'].join(',');
  for (const el of Array.from(root.querySelectorAll(embeddedControlSelector))) {
    const text = (el.textContent || '').trim();
    const isKnownButton = el.tagName.toLowerCase() === 'button' &&
      /^(show table view|show transaction view|toggle table\/transaction view)$/i.test(text);
    const isKnownInput = el.id === 'show_archived' || el.id === 'show_detailed_disclosure';
    if (!isKnownButton && !isKnownInput) continue;
    const label = el.closest('label');
    if (isKnownInput && !label) {
      removeAdjacentText(el, el.id === 'show_archived' ? /show archived/i : /show detailed disclosure/i);
    }
    (label || el).remove();
  }
  for (const el of Array.from(root.querySelectorAll('br'))) {
    const previous = el.previousSibling && String(el.previousSibling.textContent || '').trim();
    const next = el.nextSibling && String(el.nextSibling.textContent || '').trim();
    if (!previous && !next) el.remove();
  }
}

function removeAdjacentText(element, pattern) {
  for (const siblingKey of ['previousSibling', 'nextSibling']) {
    const sibling = element[siblingKey];
    if (sibling && sibling.nodeType === Node.TEXT_NODE && pattern.test(sibling.textContent || '')) {
      sibling.remove();
    }
  }
}

function pruneEmptyText(root) {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
  }
}

function fragmentToHtml(fragment) {
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

function buildModelFromFragment(fragment) {
  const root = document.createElement('div');
  root.appendChild(fragment);
  const warnings = [];
  const contracts = parseContracts(root);
  const transactions = parseTransactions(root, contracts);
  const consoleEntries = extractConsoleEntries(root);
  const parties = Array.from(new Set(contracts.flatMap(contract => contract.parties.map(p => p.name)))).sort();
  const templates = Array.from(new Set(contracts.map(contract => contract.template))).sort();
  const rawTransaction = root.querySelector('.transaction');

  if (contracts.length === 0 && root.textContent.trim()) {
    warnings.push('Explorer could not confidently extract contracts from this result. Raw remains available.');
  }
  if (transactions.length === 0 && root.textContent.trim()) {
    warnings.push('Explorer could not confidently extract a transaction tree. Raw remains available.');
  }

  return {
    contracts,
    templates,
    parties,
    transactions,
    consoleEntries,
    rawTransactionHtml: rawTransaction ? rawTransaction.outerHTML : '',
    warnings
  };
}

function parseContracts(root) {
  const contracts = [];
  const headings = Array.from(root.querySelectorAll('h1, h2, h3'));
  for (const heading of headings) {
    const table = nextTableAfter(heading);
    if (!table || table.closest('.transaction')) continue;
    const contract = contractFromHeadingAndTable(heading, table, contracts.length + 1);
    if (contract) contracts.push(contract);
  }

  if (contracts.length === 0) {
    for (const table of Array.from(root.querySelectorAll('.table table, table'))) {
      if (table.closest('.transaction')) continue;
      const contract = contractFromHeadingAndTable(null, table, contracts.length + 1);
      if (contract) contracts.push(contract);
    }
  }
  return contracts;
}

function nextTableAfter(element) {
  let cursor = element.nextElementSibling;
  while (cursor) {
    if (cursor.matches && cursor.matches('table')) return cursor;
    const nested = cursor.querySelector && cursor.querySelector('table');
    if (nested) return nested;
    if (cursor.matches && cursor.matches('h1,h2,h3')) return null;
    cursor = cursor.nextElementSibling;
  }
  return null;
}

function contractFromHeadingAndTable(heading, table, index) {
  const headerText = heading ? cleanText(heading.textContent) : 'Contract ' + index;
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return null;
  const headerCells = Array.from(rows[0].querySelectorAll('th,td'));
  const headers = headerCells.map(cell => cleanText(cell.textContent));
  const dataRow = rows.slice(1).find(row => row.querySelectorAll('td,th').length > 0);
  if (!dataRow) return null;
  const cells = Array.from(dataRow.querySelectorAll('td,th'));
  const values = cells.map(cell => cleanText(cell.textContent));
  const idIndex = headerIndex(headers, 'id');
  const statusIndex = headerIndex(headers, 'status');
  const id = valueAt(values, idIndex) || firstContractId(headerText) || ('contract-' + index);
  const archived = dataRow.classList.contains('archived') ||
    table.classList.contains('archived') ||
    valueAt(values, statusIndex).toLowerCase() === 'archived';
  const templateInfo = parseTemplateTitle(headerText);
  const fields = [];
  const disclosures = [];

  headers.forEach((header, i) => {
    if (i === idIndex || i === statusIndex) return;
    const cell = cells[i];
    const isDisclosure = cell && (cell.classList.contains('disclosure') || cell.classList.contains('disclosed'));
    const headerIsParty = isDisclosureHeader(header, headerCells[i]);
    if (isDisclosure || headerIsParty) {
      disclosures.push({
        party: header || ('party-' + (disclosures.length + 1)),
        visible: isDisclosureVisible(cell, values[i]),
        detail: cleanText(values[i]) || (isDisclosureVisible(cell, values[i]) ? 'visible' : '')
      });
    } else if (header) {
      fields.push({ name: header, value: values[i] || '' });
    }
  });

  const parties = partiesForContract(fields, disclosures);
  return {
    id,
    displayId: shortId(id),
    template: templateInfo.template,
    templateShort: templateInfo.shortName,
    packageId: templateInfo.packageId,
    status: archived ? 'archived' : (valueAt(values, statusIndex) || 'active'),
    archived,
    fields,
    parties,
    disclosures,
    transactionId: transactionIdFromContractId(id),
    sourceHref: firstRevealHref(heading) || firstRevealHref(table),
    rawHtml: heading ? heading.outerHTML + table.outerHTML : table.outerHTML
  };
}

function parseTemplateTitle(text) {
  const cleaned = cleanText(text);
  const at = cleaned.indexOf('@');
  const withoutPackage = at === -1 ? cleaned : cleaned.slice(0, at);
  const packageId = at === -1 ? '' : cleaned.slice(at + 1);
  const template = withoutPackage || cleaned || 'Unknown template';
  const shortName = template.split(':').pop().split('.').pop() || template;
  return { template, shortName, packageId };
}

function partiesForContract(fields, disclosures) {
  const names = new Map();
  for (const disclosure of disclosures) {
    addParty(names, disclosure.party, roleList(disclosure.detail));
  }
  for (const field of fields) {
    const party = partyValueFromField(field.name, field.value);
    if (party) addParty(names, party, [field.name]);
  }
  return Array.from(names.values());
}

function addParty(map, name, roles) {
  const party = cleanPartyValue(name);
  if (!party || !looksLikePartyValue(party)) return;
  const existing = map.get(party) || { name: party, roles: [] };
  for (const role of roles || []) {
    if (role && !existing.roles.includes(role)) existing.roles.push(role);
  }
  map.set(party, existing);
}

function parseTransactions(root, contracts) {
  const txMap = new Map();
  for (const contract of contracts) {
    const id = contract.transactionId || 'unknown';
    if (!txMap.has(id)) txMap.set(id, { id, label: id === 'unknown' ? 'Unknown transaction' : 'Transaction #' + id, events: [] });
    txMap.get(id).events.push({
      id: contract.id,
      kind: contract.archived ? 'Archived/Result' : 'Create',
      label: contract.templateShort,
      contractId: contract.id,
      template: contract.template,
      parties: contract.parties,
      fields: contract.fields
    });
  }

  const transactionSections = Array.from(root.querySelectorAll('.transaction'));
  transactionSections.forEach((section, index) => {
    const id = String(index + 1);
    if (!txMap.has(id)) txMap.set(id, { id, label: 'Transaction #' + id, events: [] });
    txMap.get(id).rawHtml = section.outerHTML;
    const text = cleanText(section.textContent);
    if (txMap.get(id).events.length === 0 && text) {
      txMap.get(id).events.push({ id: 'tx-' + id + '-raw', kind: 'Raw', label: text.slice(0, 80), rawText: text });
    }
  });

  return Array.from(txMap.values()).sort((a, b) => transactionSortKey(a.id) - transactionSortKey(b.id));
}

function render() {
  renderTabs();
  renderToolbarState();
  renderCurrentView();
}

function renderTabs() {
  const tabs = document.getElementById('view_tabs');
  tabs.replaceChildren();
  const consoleCount = allConsoleEntries().length;
  for (const view of VIEWS) {
    const button = el('button', {
      className: 'tab' + (state.selectedView === view.id ? ' selected' : ''),
      type: 'button',
      onclick: () => selectView(view.id)
    }, [
      document.createTextNode(view.label),
      view.id === 'console' && consoleCount > 0 ? el('span', { className: 'tab-count' }, String(consoleCount)) : null
    ]);
    tabs.appendChild(button);
  }
}

function renderToolbarState() {
  const archived = document.getElementById('show_archived');
  const disclosure = document.getElementById('show_detailed_disclosure');
  const search = document.getElementById('search_input');
  const progress = document.getElementById('progress_status');
  if (archived) archived.checked = state.showArchived;
  if (disclosure) disclosure.checked = state.showDetailedDisclosure;
  if (search && search.value !== state.search) search.value = state.search;
  if (search) search.placeholder = searchPlaceholder();
  if (progress) {
    progress.hidden = state.progressMs < 0;
    progress.textContent = state.progressMs >= 0 ? 'Running ' + formatDuration(state.progressMs) : '';
  }
  document.body.classList.toggle('hide_archived', !state.showArchived);
  document.body.classList.toggle('hidden_disclosure', !state.showDetailedDisclosure);
}

function renderCurrentView() {
  const root = document.getElementById('view_root');
  root.replaceChildren();
  if (!state.originalHtml && state.notes.length === 0) {
    document.body.classList.add('empty');
    return;
  }
  document.body.classList.remove('empty');
  if (state.parserWarnings.length && state.selectedView !== 'raw') root.appendChild(warningStrip());
  switch (state.selectedView) {
    case 'contracts': root.appendChild(renderContractsView()); break;
    case 'txTree': root.appendChild(renderTxTreeView()); break;
    case 'disclosure': root.appendChild(renderDisclosureView()); break;
    case 'console': root.appendChild(renderConsoleView()); break;
    case 'raw': root.appendChild(renderRawView()); break;
    case 'overview':
    default: root.appendChild(renderOverviewView()); break;
  }
}

function renderOverviewView() {
  const contracts = state.model.contracts;
  const shownContracts = filteredContracts();
  const transactions = transactionsForDisplay();
  const consoleEntries = allConsoleEntries();
  const active = contracts.filter(c => !c.archived).length;
  const archived = contracts.filter(c => c.archived).length;
  const parties = state.model.parties;
  const view = el('section', { className: 'overview-grid' });
  view.appendChild(el('div', { className: 'summary-row' }, [
    summaryCard('Contracts', String(contracts.length), active + ' active / ' + archived + ' archived', 'contracts'),
    summaryCard('Templates', String(state.model.templates.length), state.model.templates.slice(0, 2).join(', ') || 'No templates parsed', 'contracts'),
    summaryCard('Transactions', String(transactions.length), 'Open causal tree', 'txTree'),
    summaryCard('Console', String(consoleEntries.length), consoleEntries.length ? 'Script output available' : 'No script output', 'console')
  ]));
  view.appendChild(el('div', { className: 'overview-main' }, [
    panel('Run Summary', renderRunSummary(contracts, transactions)),
    panel('Parties & Roles', renderPartyOverview(contracts, parties)),
    panel('Transaction Flow', renderTxPreview(transactions)),
    panel('Recent Changes', renderRecentEvents(shownContracts.length ? shownContracts : contracts)),
    panel('Raw Fidelity', el('div', { className: 'fidelity' }, [
      el('p', {}, 'Raw sanitized Script Results are preserved for verification.'),
      actionButton('Open Raw', () => selectView('raw'))
    ]))
  ]));
  return view;
}

function renderRunSummary(contracts, transactions) {
  if (!contracts.length && !transactions.length) return emptyState('No parsed contracts or transactions. Open Raw for the original result.');
  const templates = Array.from(new Set(contracts.map(c => c.templateShort))).sort();
  return el('div', { className: 'overview-list' }, [
    metricRow('Active contracts', String(contracts.filter(c => !c.archived).length)),
    metricRow('Archived contracts', String(contracts.filter(c => c.archived).length)),
    metricRow('Transaction groups', String(transactions.length)),
    metricRow('Templates', templates.slice(0, 6).join(', ') || 'Unavailable')
  ]);
}

function renderPartyOverview(contracts, parties) {
  if (!parties.length) return emptyState('No parties inferred.');
  return el('div', { className: 'party-role-list compact' }, parties.map(name => {
    const roles = rolesForPartyAcrossContracts(contracts, name);
    return el('div', { className: 'party-role-row' }, [
      partyChip({ name, roles }),
      el('div', { className: 'role-stack' }, partyRoleLabels(roles).map(label =>
        el('span', { className: 'party-role-badge ' + roleCssClass(label), title: roleDescription(label) }, label)
      )),
      el('div', { className: 'muted party-role-help' }, roleSummary(partyRoleLabels(roles)))
    ]);
  }));
}

function renderTxPreview(transactions) {
  if (!transactions.length) return emptyState('No transaction tree inferred. Open Raw for the original result.');
  return el('div', { className: 'tx-preview-list' }, transactions.slice(0, 5).map(tx =>
    el('button', {
      className: 'tx-preview-row',
      type: 'button',
      onclick: () => { state.selectedTransactionId = tx.id; selectView('txTree'); }
    }, [
      eventBadge('Tx'),
      el('span', {}, tx.label),
      el('span', { className: 'muted' }, tx.events.length + ' events')
    ])
  ));
}

function renderContractsView() {
  const contracts = filteredContracts();
  const selected = contracts.find(c => c.id === state.selectedContractId) || contracts[0] || null;
  if (selected) state.selectedContractId = selected.id;
  const groups = groupBy(contracts, c => c.template);
  return el('section', { className: 'split-view contracts-view' }, [
    el('aside', { className: 'master-pane' }, [
      el('div', { className: 'pane-title' }, [
        el('strong', {}, 'Contracts'),
        el('span', { className: 'muted' }, contracts.length + ' shown')
      ]),
      ...Array.from(groups.entries()).map(([template, items]) => contractGroup(template, items))
    ]),
    el('section', { className: 'detail-pane' }, selected ? contractDetail(selected) : emptyDetail('No contract selected.'))
  ]);
}

function contractGroup(template, contracts) {
  return el('section', { className: 'contract-group' }, [
    el('div', { className: 'group-header' }, [
      el('span', {}, template),
      el('span', { className: 'muted' }, '(' + contracts.length + ')')
    ]),
    ...contracts.map(contractCard)
  ]);
}

function contractCard(contract) {
  const selected = contract.id === state.selectedContractId;
  const select = () => { state.selectedContractId = contract.id; render(); };
  return el('article', {
    className: 'contract-card' + (selected ? ' selected' : '') + (contract.archived ? ' archived' : ''),
    role: 'button',
    tabIndex: '0',
    onclick: select,
    onkeydown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    }
  }, [
    el('div', { className: 'contract-card-head' }, [
      statusBadge(contract.status),
      el('span', { className: 'contract-id mono', title: contract.id }, contract.displayId),
      copyButton(contract.id, 'Copy contract id')
    ]),
    el('div', { className: 'chip-row' }, contract.parties.slice(0, 4).map(p => partyChip(p))),
    el('dl', { className: 'field-preview' }, contract.fields.slice(0, 4).flatMap(field => [
      el('dt', {}, field.name),
      el('dd', { className: 'mono', title: field.value }, shortValue(field.value))
    ]))
  ]);
}

function contractDetail(contract) {
  return el('article', { className: 'inspector' }, [
    el('header', { className: 'inspector-header' }, [
      el('div', {}, [
        el('h2', {}, contract.templateShort),
        el('div', { className: 'muted' }, contract.template)
      ]),
      copyButton(contract.id, 'Copy contract id')
    ]),
    detailRows([
      ['Template', contract.template],
      ['Contract ID', contract.id],
      ['Status', contract.status],
      ['Created in', contract.transactionId ? 'Transaction #' + contract.transactionId : 'Unknown'],
      ['Package', contract.packageId || 'Unavailable']
    ]),
    sectionBlock('Fields', fieldTable(contract.fields)),
    sectionBlock('Parties', partyRoleList(contract.parties)),
    sectionBlock('Disclosure', disclosureMini(contract)),
    sectionBlock('References', el('div', { className: 'button-row' }, [
      contract.sourceHref ? actionButton('Open Source', () => revealLocation(contract.sourceHref)) : null,
      actionButton('Open Raw', () => selectView('raw'))
    ])),
    sectionBlock('Transaction', actionButton(contract.transactionId ? 'View Transaction #' + contract.transactionId : 'View Tx Tree', () => {
      state.selectedTransactionId = contract.transactionId || state.selectedTransactionId;
      selectView('txTree');
    }))
  ]);
}

function renderTxTreeView() {
  const transactions = filteredTransactions();
  const selected = transactions.find(tx => tx.id === state.selectedTransactionId) || transactions[0] || null;
  if (selected) state.selectedTransactionId = selected.id;
  return el('section', { className: 'split-view tx-view' }, [
    el('aside', { className: 'master-pane' }, [
      el('div', { className: 'pane-title' }, [
        el('strong', {}, 'Transactions'),
        el('span', { className: 'muted' }, transactions.length + ' shown')
      ]),
      ...transactions.map(tx => txButton(tx))
    ]),
    el('section', { className: 'detail-pane' }, selected ? txDetail(selected) : emptyDetail('No transaction data parsed. Open Raw for the original result.'))
  ]);
}

function txButton(tx) {
  return el('button', {
    className: 'tx-row' + (tx.id === state.selectedTransactionId ? ' selected' : ''),
    type: 'button',
    onclick: () => { state.selectedTransactionId = tx.id; render(); }
  }, [
    el('span', { className: 'tx-title' }, tx.label),
    el('span', { className: 'muted' }, tx.events.length + ' events')
  ]);
}

function txDetail(tx) {
  return el('article', { className: 'inspector' }, [
    el('header', { className: 'inspector-header' }, [
      el('div', {}, [
        el('h2', {}, tx.label),
        el('div', { className: 'muted' }, tx.events.length + ' parsed events')
      ]),
      el('div', { className: 'button-row' }, [
        actionButton('Expand all', () => document.querySelectorAll('details.tx-node').forEach(d => d.open = true)),
        actionButton('Collapse all', () => document.querySelectorAll('details.tx-node').forEach(d => d.open = false))
      ])
    ]),
    txSummary(tx),
    el('div', { className: 'tx-tree' }, tx.events.map((event, index) => eventNode(event, index + 1))),
    tx.rawHtml ? sectionBlock('Original Transaction Markup', rawRendered(tx.rawHtml)) : null
  ]);
}

function txSummary(tx) {
  const parties = Array.from(new Set(tx.events.flatMap(event => (event.parties || []).map(p => p.name)))).sort();
  return el('section', { className: 'tx-summary-panel' }, [
    metricRow('Events', String(tx.events.length)),
    metricRow('Parties', parties.length ? parties.join(', ') : 'Unavailable'),
    metricRow('Created contracts', String(tx.events.filter(e => String(e.kind).toLowerCase().includes('create')).length)),
    metricRow('Archived/results', String(tx.events.filter(e => String(e.kind).toLowerCase().includes('archived')).length))
  ]);
}

function eventNode(event, index) {
  return el('details', { className: 'tx-node', open: true }, [
    el('summary', {}, [
      el('span', { className: 'tx-step' }, String(index)),
      eventBadge(event.kind),
      el('span', { className: 'tx-event-title' }, event.label),
      event.contractId ? el('button', {
        className: 'link-button mono',
        type: 'button',
        onclick: ev => { ev.preventDefault(); state.selectedContractId = event.contractId; selectView('contracts'); }
      }, shortId(event.contractId)) : null
    ]),
    el('div', { className: 'tx-node-body' }, [
      event.template ? el('div', { className: 'muted' }, event.template) : null,
      event.parties && event.parties.length ? el('div', { className: 'chip-row' }, event.parties.map(partyChip)) : null,
      event.fields && event.fields.length ? compactFieldGrid(event.fields.slice(0, 6)) : null
    ])
  ]);
}

function renderDisclosureView() {
  const contracts = filteredContracts();
  const parties = state.model.parties;
  if (contracts.length === 0 || parties.length === 0) return emptyDetail('No disclosure data could be inferred. Open Raw for the original result.');
  const divulged = parties.filter(party => contracts.some(contract => disclosureState(contract, party).kind === 'divulged'));
  return el('section', { className: 'disclosure-view' }, [
    el('div', { className: 'pane-title' }, [
      el('strong', {}, 'Disclosure Matrix'),
      el('span', { className: 'muted' }, parties.length + ' parties / ' + contracts.length + ' contracts')
    ]),
    divulged.length ? el('div', { className: 'divulgence-strip' }, [
      el('strong', {}, 'Divulged in transaction'),
      ...divulged.map(party => partyChip({ name: party, roles: ['divulged'] }))
    ]) : null,
    el('div', { className: 'matrix-scroll' }, [
      el('table', { className: 'disclosure-matrix' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', {}, 'Contract'),
            ...parties.map(p => el('th', {}, partyChip(p)))
          ])
        ]),
        el('tbody', {}, contracts.map(contract => el('tr', {}, [
          el('td', {}, [
            el('button', {
              className: 'link-button',
              type: 'button',
              onclick: () => { state.selectedContractId = contract.id; selectView('contracts'); }
            }, contract.templateShort),
            el('div', { className: 'muted mono' }, contract.displayId)
          ]),
          ...parties.map(party => disclosureCell(contract, party))
        ])))
      ])
    ])
  ]);
}

function renderConsoleView() {
  const allNotes = allConsoleEntries();
  const notes = allNotes.filter(note => matchesSearch(note.text));
  return el('section', { className: 'console-view' }, [
    el('div', { className: 'pane-title' }, [
      el('strong', {}, 'Console'),
      el('span', { className: 'muted' }, notes.length + ' entries'),
      actionButton('Copy all', () => copyText(allNotes.map(n => n.text).join('\n\n')))
    ]),
    notes.length ? el('div', { className: 'log-list' }, notes.map(logEntry)) : emptyState('No script debug output or notes were found.')
  ]);
}

function renderRawView() {
  return el('section', { className: 'raw-view' }, [
    el('div', { className: 'pane-title' }, [
      el('strong', {}, 'Raw Sanitized Script Results'),
      el('span', { className: 'muted' }, byteSize(state.sanitizedHtml) + ' sanitized'),
      actionButton('Copy HTML', () => copyText(state.sanitizedHtml))
    ]),
    rawRendered(state.sanitizedHtml),
    el('details', { className: 'raw-source' }, [
      el('summary', {}, 'Sanitized HTML source'),
      el('pre', { className: 'raw-code' }, state.sanitizedHtml || 'No HTML received.')
    ])
  ]);
}

function warningStrip() {
  return el('div', { className: 'warning-strip' }, [
    el('strong', {}, 'Parsed view may be incomplete.'),
    document.createTextNode(' Raw remains available. '),
    actionButton('Open Raw', () => selectView('raw'))
  ]);
}

function summaryCard(label, value, description, targetView) {
  return el('button', { className: 'summary-card', type: 'button', onclick: () => selectView(targetView) }, [
    el('span', { className: 'summary-label' }, label),
    el('strong', {}, value),
    el('span', { className: 'muted' }, description)
  ]);
}

function renderRecentEvents(contracts) {
  if (!contracts.length) return emptyState('No parsed changes.');
  return el('div', { className: 'event-list' }, contracts.slice(0, 6).map(contract =>
    el('button', {
      className: 'event-row',
      type: 'button',
      onclick: () => { state.selectedContractId = contract.id; selectView('contracts'); }
    }, [
      eventBadge(contract.archived ? 'Archived' : 'Create'),
      el('span', {}, contract.templateShort),
      el('span', { className: 'muted mono' }, contract.displayId)
    ])
  ));
}

function panel(title, body) {
  return el('section', { className: 'panel' }, [el('h3', {}, title), body]);
}

function metricRow(label, value) {
  return el('div', { className: 'metric-row' }, [
    el('span', { className: 'muted' }, label),
    el('strong', {}, value)
  ]);
}

function sectionBlock(title, body) {
  return el('section', { className: 'section-block' }, [el('h3', {}, title), body || emptyState('Unavailable')]);
}

function detailRows(rows) {
  return el('dl', { className: 'detail-rows' }, rows.flatMap(([label, value]) => [
    el('dt', {}, label),
    el('dd', { className: String(value).length > 32 ? 'mono wrap' : '' }, String(value || 'Unavailable'))
  ]));
}

function fieldTable(fields) {
  if (!fields || !fields.length) return emptyState('No fields inferred.');
  return el('table', { className: 'field-table' }, [
    el('tbody', {}, fields.map(field => el('tr', {}, [
      el('th', {}, field.name),
      el('td', { className: 'mono wrap' }, [
        referenceValue(field.value),
        copyButton(field.value, 'Copy value')
      ])
    ])))
  ]);
}

function compactFieldGrid(fields) {
  if (!fields || !fields.length) return emptyState('No fields inferred.');
  return el('dl', { className: 'compact-field-grid' }, fields.flatMap(field => [
    el('dt', {}, field.name),
    el('dd', { className: 'mono wrap' }, shortValue(field.value))
  ]));
}

function referenceValue(value) {
  const text = String(value || '');
  const id = text.match(/#\d+:\d+/);
  if (!id) return document.createTextNode(text);
  return el('button', {
    className: 'link-button mono',
    type: 'button',
    onclick: () => {
      const target = state.model.contracts.find(contract => contract.id === id[0]);
      if (target) {
        state.selectedContractId = target.id;
        selectView('contracts');
      }
    }
  }, text);
}

function disclosureMini(contract) {
  if (!contract.disclosures.length) return emptyState('No disclosure columns inferred.');
  return el('div', { className: 'chip-row' }, contract.disclosures.map(disclosure =>
    el('span', { className: 'role-chip' + (disclosure.visible ? ' visible' : '') }, [
      partyChip({ name: disclosure.party, roles: roleList(disclosure.detail) }),
      el('span', {}, disclosure.visible ? (state.showDetailedDisclosure ? disclosure.detail || 'visible' : 'visible') : 'hidden')
    ])
  ));
}

function disclosureCell(contract, party) {
  const stateForParty = disclosureState(contract, party);
  return el('td', { className: 'matrix-' + stateForParty.kind }, stateForParty.kind !== 'hidden'
    ? el('span', { className: 'role-badge ' + roleCssClass(stateForParty.kind), title: stateForParty.title }, stateForParty.label)
    : el('span', { className: 'muted' }, '-'));
}

function rawRendered(html) {
  const box = el('div', { className: 'raw-rendered' });
  const fragment = sanitizeToFragment(html);
  box.appendChild(fragment);
  return box;
}

function logEntry(note) {
  return el('article', { className: 'log-entry ' + note.severity }, [
    el('div', { className: 'log-meta' }, [
      el('span', { className: 'severity' }, note.severity),
      el('span', { className: 'muted' }, note.timestamp || note.sourceLabel || 'script result'),
      copyButton(note.text, 'Copy log line')
    ]),
    el('div', { className: 'log-body mono' }, note.html ? htmlFragment(note.html) : document.createTextNode(note.text))
  ]);
}

function htmlFragment(html) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(sanitizeToFragment(html));
  return fragment;
}

function extractConsoleEntries(root) {
  const entries = [];
  for (const element of Array.from(root.querySelectorAll(CONSOLE_SELECTOR))) {
    const text = cleanConsoleText(element.textContent);
    const entry = makeConsoleEntry(text, element.outerHTML || element.innerHTML, sourceForConsoleElement(element), 'script result');
    if (entry) entries.push(entry);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || parent.closest(CONSOLE_SELECTOR + ',table,h1,h2,h3,.transaction,button,label')) continue;
    for (const line of String(node.textContent || '').split(/\r?\n/)) {
      const text = cleanConsoleText(line);
      if (!looksLikeConsoleLine(text)) continue;
      const entry = makeConsoleEntry(text, '', 'script-result', 'script result');
      if (entry) entries.push(entry);
    }
  }
  return mergeConsoleEntries(entries);
}

function sourceForConsoleElement(element) {
  const classes = String(element.className || '').toLowerCase();
  if (classes.includes('debug') || classes.includes('trace')) return 'debug';
  if (classes.includes('note')) return 'note';
  if (classes.includes('log') || classes.includes('console') || classes.includes('output')) return 'log';
  return 'script-result';
}

function consoleEntryFromHtml(html, source) {
  const fragment = sanitizeToFragment(html);
  const text = cleanConsoleText(fragment.textContent);
  const safeHtml = fragmentToHtml(fragment);
  return makeConsoleEntry(text || safeHtml || String(html || ''), safeHtml, source || 'server-note', 'server note');
}

function makeConsoleEntry(text, html, source, sourceLabel) {
  const body = cleanConsoleText(text || html);
  if (!body) return null;
  return {
    id: '',
    html: html || '',
    text: body,
    severity: classifySeverity(body),
    timestamp: source === 'server-note' ? new Date().toLocaleTimeString() : '',
    source: source || 'script-result',
    sourceLabel: sourceLabel || source || 'script result'
  };
}

function allConsoleEntries() {
  return mergeConsoleEntries(state.notes, state.model.consoleEntries);
}

function mergeConsoleEntries() {
  const merged = [];
  const seen = new Set();
  for (const group of Array.from(arguments)) {
    for (const entry of group || []) {
      if (!entry) continue;
      const key = normalizeConsoleText(entry.text || entry.html);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(Object.assign({}, entry, { id: entry.id || ('console-' + (merged.length + 1)) }));
    }
  }
  return merged;
}

function cleanConsoleText(text) {
  return cleanText(String(text || '').replace(/\u001b\[[0-9;]*m/g, ''));
}

function normalizeConsoleText(text) {
  return cleanConsoleText(text)
    .replace(/^(trace|debug|info|warn(?:ing)?|error)\s*[:\]-\s]+/i, '')
    .replace(/^["'](.+)["']$/, '$1')
    .toLowerCase();
}

function looksLikeConsoleLine(text) {
  const value = cleanConsoleText(text);
  if (!value || value.length > 1000) return false;
  return /^(trace|debug|info|warn(?:ing)?|error)\b\s*[:\]-]?/i.test(value) ||
    /^\[[^\]]{1,48}\]\s+/.test(value) ||
    /^script service stderr:/i.test(value);
}

function statusBadge(status) {
  const normalized = String(status || 'active').toLowerCase();
  return el('span', { className: 'status-badge ' + (normalized === 'archived' ? 'archived' : 'active') }, normalized || 'active');
}

function eventBadge(kind) {
  const css = String(kind || '').toLowerCase().replace(/[^a-z]+/g, '-');
  return el('span', { className: 'event-badge ' + css }, kind || 'Event');
}

function partyRoleList(parties) {
  if (!parties || !parties.length) return emptyState('No parties inferred.');
  return el('div', { className: 'party-role-list' }, parties.map(party => {
    const labels = partyRoleLabels(party.roles);
    return el('div', { className: 'party-role-row' }, [
      partyChip(party),
      el('div', { className: 'role-stack' }, labels.map(label =>
        el('span', { className: 'party-role-badge ' + roleCssClass(label), title: roleDescription(label) }, label)
      )),
      el('div', { className: 'muted party-role-help' }, roleSummary(labels))
    ]);
  }));
}

function rolesForPartyAcrossContracts(contracts, partyName) {
  const roles = [];
  for (const contract of contracts) {
    const party = contract.parties.find(item => item.name === partyName);
    if (party) roles.push(...party.roles);
    const disclosure = contract.disclosures.find(item => item.party === partyName);
    if (disclosure && disclosure.visible) roles.push(...roleList(disclosure.detail || 'visible'));
  }
  return Array.from(new Set(roles));
}

function partyChip(party, roles) {
  const label = typeof party === 'string' ? party : (party && party.name) || '';
  const roleLabels = partyRoleLabels(roles || (party && party.roles));
  const title = roleLabels.length ? label + ' - ' + roleLabels.map(roleDescription).join('; ') : label;
  return el('span', { className: 'party-chip party-' + stableColorIndex(label), title }, [
    el('span', { className: 'party-name' }, label || 'unknown'),
    ...roleLabels.slice(0, 2).map(role =>
      el('span', { className: 'party-chip-role ' + roleCssClass(role) }, role)
    )
  ]);
}

function copyButton(value, title) {
  return el('button', {
    className: 'copy-button',
    type: 'button',
    title: title || 'Copy',
    onclick: event => { event.stopPropagation(); copyText(String(value || '')); }
  }, 'Copy');
}

function actionButton(label, action) {
  return el('button', { className: 'action-button', type: 'button', onclick: action }, label);
}

function emptyState(text) {
  return el('div', { className: 'empty-state' }, text);
}

function emptyDetail(text) {
  return el('section', { className: 'empty-detail' }, [emptyState(text), actionButton('Open Raw', () => selectView('raw'))]);
}

function filteredContracts() {
  const query = state.search.toLowerCase();
  return state.model.contracts.filter(contract => {
    if (!state.showArchived && contract.archived) return false;
    if (!query) return true;
    return [
      contract.id, contract.template, contract.templateShort, contract.status,
      ...contract.fields.flatMap(f => [f.name, f.value]),
      ...contract.parties.map(p => p.name)
    ].join(' ').toLowerCase().includes(query);
  });
}

function filteredTransactions() {
  const query = state.search.toLowerCase();
  return transactionsForDisplay().map(tx => {
    const events = tx.events.filter(event => {
      const contract = event.contractId ? state.model.contracts.find(item => item.id === event.contractId) : null;
      if (contract && !state.showArchived && contract.archived) return false;
      if (!query) return true;
      return [event.kind, event.label, event.template, event.contractId]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    return Object.assign({}, tx, { events });
  }).filter(tx => {
    if (!tx.events.length && !tx.rawHtml) return false;
    if (!query) return true;
    return [tx.id, tx.label, ...tx.events.map(e => [e.kind, e.label, e.template, e.contractId].join(' ')), tx.rawHtml || '']
      .join(' ').toLowerCase().includes(query);
  });
}

function transactionsForDisplay() {
  return state.model.transactions.length ? state.model.transactions : synthesizeTransactionsFromContracts(state.model.contracts);
}

function synthesizeTransactionsFromContracts(contracts) {
  const map = new Map();
  for (const contract of contracts) {
    const id = contract.transactionId || 'unknown';
    if (!map.has(id)) map.set(id, { id, label: id === 'unknown' ? 'Unknown transaction' : 'Transaction #' + id, events: [] });
    map.get(id).events.push({
      id: contract.id,
      kind: contract.archived ? 'Archived/Result' : 'Create',
      label: contract.templateShort,
      contractId: contract.id,
      template: contract.template,
      parties: contract.parties,
      fields: contract.fields
    });
  }
  return Array.from(map.values()).sort((a, b) => transactionSortKey(a.id) - transactionSortKey(b.id));
}

function matchesSearch(text) {
  return !state.search || String(text || '').toLowerCase().includes(state.search.toLowerCase());
}

function selectView(view) {
  state.selectedView = normalizeView(view);
  vscode.postMessage({ command: 'set_selected_view', value: state.selectedView });
  render();
}

function revealLocation(href) {
  if (!href) return;
  vscode.postMessage({ command: 'reveal_location', value: href });
}

function toggleArchived() {
  state.showArchived = Boolean(document.getElementById('show_archived').checked);
  document.body.classList.toggle('hide_archived', !state.showArchived);
  vscode.postMessage({ command: 'set_show_archived', value: state.showArchived });
  render();
}

function toggleDetailedDisclosure() {
  state.showDetailedDisclosure = Boolean(document.getElementById('show_detailed_disclosure').checked);
  document.body.classList.toggle('hidden_disclosure', !state.showDetailedDisclosure);
  vscode.postMessage({ command: 'set_show_detailed_disclosure', value: state.showDetailedDisclosure });
  render();
}

function updateSearch() {
  state.search = document.getElementById('search_input').value || '';
  renderCurrentView();
}

function searchPlaceholder() {
  switch (state.selectedView) {
    case 'contracts': return 'Search templates, fields, parties, contract ids...';
    case 'txTree': return 'Search transaction ids, events, templates, parties...';
    case 'disclosure': return 'Search contracts, parties, roles...';
    case 'console': return 'Search console output...';
    case 'raw': return 'Search raw result text...';
    default: return 'Search results...';
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function headerIndex(headers, name) {
  return headers.findIndex(header => header.toLowerCase() === name);
}

function valueAt(values, index) {
  return index >= 0 ? (values[index] || '') : '';
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function textOf(node) {
  return cleanText(node && node.textContent);
}

function shortId(id) {
  const value = String(id || '');
  if (value.length <= 18) return value;
  return value.slice(0, 10) + '...' + value.slice(-8);
}

function shortValue(value) {
  const text = String(value || '');
  return text.length > 42 ? text.slice(0, 34) + '...' + text.slice(-6) : text;
}

function firstContractId(text) {
  const match = String(text || '').match(/#\d+:\d+/);
  return match ? match[0] : '';
}

function transactionIdFromContractId(id) {
  const match = String(id || '').match(/^#?(\d+):/);
  return match ? match[1] : '';
}

function transactionSortKey(id) {
  const n = Number(String(id).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function firstRevealHref(root) {
  const link = root && root.querySelector && root.querySelector('a[href^="command:daml.revealLocation"]');
  return link ? link.getAttribute('href') : '';
}

function isDisclosureHeader(header, headerCell) {
  const text = String(header || '').toLowerCase();
  return Boolean(text) && !['id', 'status'].includes(text) &&
    Boolean(headerCell && (
      headerCell.classList.contains('observer') ||
      headerCell.querySelector('.observer,.tooltip,.tooltiptext')
    ) || looksLikeDisclosurePartyHeader(header));
}

function isDisclosureVisible(cell, value) {
  if (!cell) return false;
  const text = String(value || '').trim().toLowerCase();
  return cell.classList.contains('disclosed') || text === 'x' || text === 'visible' || text.includes('observer') || text.includes('signatory');
}

function partyValueFromField(name, value) {
  if (!isPartyFieldName(name)) return '';
  const party = cleanPartyValue(value);
  return looksLikePartyValue(party) ? party : '';
}

function isPartyFieldName(name) {
  const lowerName = String(name || '').toLowerCase();
  return lowerName.includes('party') ||
    lowerName === 'operator' ||
    lowerName === 'depositor' ||
    lowerName === 'public' ||
    lowerName === 'vaultissuer';
}

function cleanPartyValue(value) {
  const text = String(value || '').trim();
  const singleQuoted = text.match(/^'([^']+)'$/);
  return singleQuoted ? singleQuoted[1] : text;
}

function looksLikePartyValue(value) {
  const text = cleanPartyValue(value);
  if (!text || text.startsWith('#')) return false;
  if (/^".*"$/.test(text)) return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return false;
  return /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(text);
}

function looksLikeDisclosurePartyHeader(value) {
  const text = cleanPartyValue(value);
  return looksLikePartyValue(text) && (text.includes('-') || text.includes('::'));
}

function roleList(text) {
  const value = String(text || '').toLowerCase();
  const roles = [];
  if (value.includes('controller')) roles.push('controller');
  if (value.includes('signatory')) roles.push('signatory');
  if (value.includes('observer')) roles.push('observer');
  if (value.includes('witness')) roles.push('witness');
  if (value === 'visible') roles.push('visible');
  if (!roles.length && value) roles.push(cleanRole(value));
  return roles;
}

function partyRoleLabels(roles) {
  const normalized = Array.from(new Set((roles || []).map(cleanRole).filter(Boolean)));
  const labels = [];
  for (const role of normalized) {
    if (role === 'signatory' || role === 'observer') {
      pushUnique(labels, role);
      pushUnique(labels, 'stakeholder');
    } else if (role === 'visible') {
      pushUnique(labels, 'disclosed');
    } else if (role === 'witness') {
      pushUnique(labels, 'witness');
    } else if (role === 'controller') {
      pushUnique(labels, 'controller');
    } else if (isPartyFieldName(role)) {
      pushUnique(labels, 'field:' + role);
    } else {
      pushUnique(labels, role);
    }
  }
  return labels;
}

function cleanRole(role) {
  return String(role || '').trim().toLowerCase();
}

function pushUnique(items, value) {
  if (value && !items.includes(value)) items.push(value);
}

function roleCssClass(role) {
  return 'role-' + String(role || '').replace(/[^a-z0-9]+/g, '-');
}

function roleDescription(role) {
  switch (role) {
    case 'stakeholder': return 'Stakeholder, derived from signatory or observer';
    case 'signatory': return 'Signatory on the contract';
    case 'observer': return 'Observer on the contract';
    case 'controller': return 'Controller of a visible action or choice';
    case 'witness': return 'Witness or disclosed visibility in the transaction';
    case 'disclosed': return 'Visible in the disclosure table';
    default:
      if (String(role).startsWith('field:')) return 'Referenced by contract field ' + String(role).substring('field:'.length);
      return role;
  }
}

function roleSummary(labels) {
  if (labels.includes('stakeholder')) return 'Stakeholder on this contract.';
  if (labels.includes('controller')) return 'Can act as a controller for a visible action.';
  if (labels.includes('witness') || labels.includes('disclosed')) return 'Visible through disclosure, not necessarily a stakeholder.';
  if (labels.some(label => label.startsWith('field:'))) return 'Referenced by a Party-valued contract field.';
  return 'Role inferred from script-result disclosure.';
}

function disclosureState(contract, party) {
  const disclosure = contract.disclosures.find(d => d.party === party);
  const partyMatch = contract.parties.find(p => p.name === party);
  const roles = partyMatch ? partyMatch.roles.slice() : [];
  if (disclosure && disclosure.visible) roles.push(...roleList(disclosure.detail || 'visible'));
  return classifyDisclosureState(roles, Boolean(disclosure && disclosure.visible));
}

function classifyDisclosureState(roles, disclosureVisible) {
  const labels = partyRoleLabels(roles);
  const stakeholder = labels.includes('stakeholder');
  const field = labels.find(label => label.startsWith('field:'));
  if (disclosureVisible && !stakeholder) {
    return { kind: 'divulged', label: 'divulged', title: 'Some transaction data was disclosed to this non-stakeholder party.' };
  }
  if (stakeholder) {
    return { kind: 'stakeholder', label: 'stakeholder', title: 'Party is a stakeholder on this contract.' };
  }
  if (labels.includes('controller')) {
    return { kind: 'controller', label: 'controller', title: 'Party can act as a controller for a visible action.' };
  }
  if (field) {
    return { kind: 'field', label: field, title: roleDescription(field) };
  }
  return { kind: 'hidden', label: '-', title: 'No inferred visibility.' };
}

function classifySeverity(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('error') || value.includes('failed') || value.includes('exception')) return 'error';
  if (value.includes('warn')) return 'warning';
  if (value.includes('debug') || value.includes('trace')) return 'debug';
  return 'info';
}

function stableColorIndex(text) {
  let hash = 0;
  for (const ch of String(text || '')) hash = ((hash * 31) + ch.charCodeAt(0)) & 0xffff;
  return Math.abs(hash % 6);
}

function byteSize(text) {
  return new Blob([String(text || '')]).size + ' bytes';
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + 'm ' + String(remainder).padStart(2, '0') + 's';
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } catch (_) {}
  area.remove();
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  const attributes = attrs || {};
  Object.keys(attributes).forEach(key => {
    const value = attributes[key];
    if (value == null) return;
    if (key === 'className') node.className = value;
    else if (key === 'onclick') node.addEventListener('click', value);
    else if (key === 'onkeydown') node.addEventListener('keydown', value);
    else if (key === 'open') node.open = Boolean(value);
    else if (key === 'tabIndex') node.tabIndex = Number(value);
    else if (key === 'type') node.type = value;
    else node.setAttribute(key, value);
  });
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('message', function (event) {
    const message = event.data || {};

    function showOrHideClassWithName(show, showClass, hideClass, checkBoxId) {
      document.body.classList.remove(show ? hideClass : showClass);
      document.body.classList.add(show ? showClass : hideClass);
      const checkbox = document.getElementById(checkBoxId);
      if (checkbox) checkbox.checked = show;
    }

    switch (message.command) {
      case 'set_html':
        setHtmlContent(message.value);
        break;
      case 'add_note':
        addConsoleNote(message.value);
        break;
      case 'set_progress':
        setProgress(message.value);
        break;
      case 'set_view': {
        const value = message.value || {};
        state.selectedView = normalizeView(value.selected);
        state.showArchived = Boolean(value.showArchived);
        state.showDetailedDisclosure = Boolean(value.showDetailedDisclosure);
        setIdeTheme(value.theme);
        showOrHideClassWithName(state.showArchived, 'show_archived', 'hide_archived', 'show_archived');
        showOrHideClassWithName(state.showDetailedDisclosure, 'show_disclosure', 'hidden_disclosure', 'show_detailed_disclosure');
        render();
        break;
      }
    }
  });

  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!target) return;
    const href = target.getAttribute('href') || '';
    if (!href.startsWith('command:daml.revealLocation')) return;
    event.preventDefault();
    revealLocation(href);
  });

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      const input = document.getElementById('search_input');
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    }
    if (!event.metaKey && !event.ctrlKey && event.altKey && /^[1-6]$/.test(event.key)) {
      selectView(VIEWS[Number(event.key) - 1].id);
    }
  });

  function initializeExplorer() {
    document.getElementById('show_archived').addEventListener('change', toggleArchived);
    document.getElementById('show_detailed_disclosure').addEventListener('change', toggleDetailedDisclosure);
    document.getElementById('search_input').addEventListener('input', updateSearch);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExplorer);
  } else {
    initializeExplorer();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeView,
    shortId,
    classifySeverity,
    parseTemplateTitle,
    transactionIdFromContractId,
    roleList,
    formatDuration,
    isDisclosureHeader,
    partyValueFromField,
    looksLikePartyValue,
    partyRoleLabels,
    roleDescription,
    classifyDisclosureState,
    synthesizeTransactionsFromContracts,
    normalizeConsoleText,
    looksLikeConsoleLine,
    mergeConsoleEntries
  };
}
