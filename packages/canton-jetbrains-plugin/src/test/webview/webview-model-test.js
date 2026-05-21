const assert = require('assert');
const webview = require('../../main/resources/webview/webview.js');

assert.strictEqual(webview.normalizeView('table'), 'contracts');
assert.strictEqual(webview.normalizeView('transaction'), 'txTree');
assert.strictEqual(webview.normalizeView('console'), 'console');
assert.strictEqual(webview.normalizeView('unexpected'), 'overview');

const template = webview.parseTemplateTitle(
  'SimpleVault.Impl.SimplePricer:SimplePricer@334001223b63671e1795e08c5e0c8b9e'
);
assert.strictEqual(template.template, 'SimpleVault.Impl.SimplePricer:SimplePricer');
assert.strictEqual(template.shortName, 'SimplePricer');
assert.strictEqual(template.packageId, '334001223b63671e1795e08c5e0c8b9e');

assert.strictEqual(webview.transactionIdFromContractId('#12:0'), '12');
assert.strictEqual(webview.shortId('#12345678901234567890:0'), '#123456789...567890:0');
assert.deepStrictEqual(webview.roleList('controller signatory observer witness'), [
  'controller',
  'signatory',
  'observer',
  'witness'
]);
// Disclosure cells concatenate a one-letter glyph with the tooltip word ("D" + "Divulged");
// roleList must still resolve that to the 'divulged' role rather than a junk 'ddivulged' label.
assert.deepStrictEqual(webview.roleList('DDivulged'), ['divulged']);
assert.deepStrictEqual(webview.roleList('Divulged'), ['divulged']);
assert.strictEqual(webview.classifySeverity('script failed with exception'), 'error');
assert.strictEqual(webview.classifySeverity('warn: missing party'), 'warning');
assert.strictEqual(webview.classifySeverity('trace details'), 'debug');
assert.strictEqual(webview.classifySeverity('script completed'), 'info');
assert.strictEqual(webview.formatDuration(3400), '3s');
assert.strictEqual(webview.formatDuration(61000), '1m 01s');

assert.strictEqual(webview.partyValueFromField('operator', "'operator-9b3970be'"), 'operator-9b3970be');
assert.strictEqual(webview.partyValueFromField('vaultIssuer', "'vaultIssuer-d4d95138'"), 'vaultIssuer-d4d95138');
assert.strictEqual(webview.partyValueFromField('depositConfigCid', '#3:0'), '');
assert.strictEqual(webview.partyValueFromField('vaultId', '"v1"'), '');
assert.strictEqual(webview.isDisclosureHeader('depositConfigCid'), false);
assert.strictEqual(webview.isDisclosureHeader('operator'), false);
assert.strictEqual(webview.isDisclosureHeader('operator-9b3970be'), true);
assert.strictEqual(webview.looksLikePartyValue('#3:0'), false);
assert.strictEqual(webview.looksLikePartyValue('"v1"'), false);
assert.deepStrictEqual(webview.partyRoleLabels(['signatory', 'operator']), [
  'signatory',
  'stakeholder',
  'field:operator'
]);
assert.deepStrictEqual(webview.partyRoleLabels(['observer']), ['observer', 'stakeholder']);
assert.deepStrictEqual(webview.partyRoleLabels(['visible']), ['disclosed']);
// Regression: partyChip used as a bare .map callback receives the array index as `roles`;
// partyRoleLabels must tolerate a non-array argument instead of throwing and blanking the Tx Tree.
assert.deepStrictEqual(webview.partyRoleLabels(1), []);
assert.deepStrictEqual(webview.partyRoleLabels(undefined), []);
assert.strictEqual(webview.roleDescription('field:operator'), 'Referenced by contract field operator');
assert.strictEqual(webview.classifyDisclosureState(['signatory'], true).kind, 'stakeholder');
assert.strictEqual(webview.classifyDisclosureState(['visible'], true).kind, 'divulged');
assert.strictEqual(webview.classifyDisclosureState(['operator'], false).kind, 'field');
assert.strictEqual(webview.classifyDisclosureState([], false).kind, 'hidden');
assert.strictEqual(webview.synthesizeTransactionsFromContracts([
  { id: '#1:0', transactionId: '1', archived: false, templateShort: 'A', template: 'M:A', parties: [], fields: [] },
  { id: '#2:0', transactionId: '2', archived: true, templateShort: 'B', template: 'M:B', parties: [], fields: [] }
]).length, 2);
const txEvents = webview.transactionEventsFromText(`
Transaction #1
create SimplePricer #1:0
exercise Archive on #1:0
fetch SimpleProcessor #2:0
`, '1', new Map([
  ['#1:0', { id: '#1:0', templateShort: 'SimplePricer', template: 'M:SimplePricer', parties: [], fields: [{ name: 'operator', value: "'alice'" }] }]
]));
assert.strictEqual(txEvents.length, 3);
assert.strictEqual(txEvents[0].kind, 'Create');
assert.strictEqual(txEvents[0].label, 'SimplePricer');
assert.strictEqual(txEvents[0].fields.length, 1);
assert.strictEqual(txEvents[1].kind, 'Archive');
assert.strictEqual(txEvents[1].contractId, '#1:0');
assert.strictEqual(txEvents[2].kind, 'Fetch');
const mergedTransactions = webview.mergeTransactionGroups(
  [{ id: '1', label: 'Transaction #1', events: [{ kind: 'Create', label: 'A', contractId: '#1:0' }], rawHtml: '<div></div>' }],
  [{ id: '1', label: 'Transaction #1', events: [{ kind: 'Create', label: 'A', contractId: '#1:0' }, { kind: 'Create', label: 'B', contractId: '#2:0' }] }]
);
assert.strictEqual(mergedTransactions.length, 1);
assert.strictEqual(mergedTransactions[0].events.length, 2);
assert.strictEqual(webview.flattenEvents([{ kind: 'Create', children: [{ kind: 'Exercise' }] }]).length, 2);
const damlTxs = webview.damlTransactionsFromText(`
Transactions:
  TX 6 1970-01-01T00:00:00Z (Tests.VaultTest:40:15)
  #6:0
  └─> 'operator-9b3970be' and 'vaultIssuer-d4d95138' exercises CreateVault on #5:0 (Vault.Factory:VaultFactory@pkg)
      with
        operator = 'operator-9b3970be'; public = 'public-1df42503'
      children:
      #6:1
      └─> 'operator-9b3970be' fetches #4:0 (Vault.Vault:VaultConfig@pkg)

      #6:2
      └─> 'operator-9b3970be' and 'vaultIssuer-d4d95138' create Vault.Vault:Vault@pkg
          with
            vaultIssuer = 'vaultIssuer-d4d95138'; operator = 'operator-9b3970be'

  TX 8 1970-01-01T00:00:00Z (Tests.VaultTest:52:17)
  #8:0
  └─> 'operator-9b3970be' exercises AcceptDeposit on #7:2 (Vault.Deposit.Workflow:DepositRequest@pkg)
`, new Map([
  ['#5:0', { id: '#5:0', templateShort: 'VaultFactory', template: 'Vault.Factory:VaultFactory', parties: [], fields: [] }],
  ['#4:0', { id: '#4:0', templateShort: 'VaultConfig', template: 'Vault.Vault:VaultConfig', parties: [], fields: [] }],
  ['#6:2', { id: '#6:2', templateShort: 'Vault', template: 'Vault.Vault:Vault', parties: [], fields: [{ name: 'operator', value: "'operator-9b3970be'" }] }],
  ['#7:2', { id: '#7:2', templateShort: 'DepositRequest', template: 'Vault.Deposit.Workflow:DepositRequest', parties: [], fields: [] }]
]));
assert.strictEqual(damlTxs.length, 2);
assert.strictEqual(damlTxs[0].id, '6');
assert.strictEqual(damlTxs[0].events.length, 1);
assert.strictEqual(damlTxs[0].events[0].kind, 'Exercise');
assert.strictEqual(damlTxs[0].events[0].label, 'CreateVault');
assert.strictEqual(damlTxs[0].events[0].contractId, '#5:0');
assert.deepStrictEqual(damlTxs[0].events[0].actors.map(party => party.name), [
  'operator-9b3970be',
  'vaultIssuer-d4d95138'
]);
assert.strictEqual(damlTxs[0].events[0].children.length, 2);
assert.strictEqual(damlTxs[0].events[0].children[0].kind, 'Fetch');
assert.strictEqual(damlTxs[0].events[0].children[1].kind, 'Create');
assert.strictEqual(damlTxs[0].events[0].children[1].contractId, '#6:2');
assert.strictEqual(damlTxs[1].id, '8');
assert.strictEqual(damlTxs[1].events[0].label, 'AcceptDeposit');
assert.deepStrictEqual(webview.consoleLinesFromTransactionTraceText(`
Transactions:
  TX 8 1970-01-01T00:00:00Z
Return value: {}
Trace:
  "[Accept] start"
  "[Validator] amount=100.0"
  "[Test] OK (flow + privacy)"
`), [
  '[Accept] start',
  '[Validator] amount=100.0',
  '[Test] OK (flow + privacy)'
]);
assert.strictEqual(webview.looksLikeConsoleLine('TRACE: [Test] OK (flow + privacy)'), true);
assert.strictEqual(webview.looksLikeConsoleLine('[Test] OK (flow + privacy)'), true);
assert.strictEqual(webview.looksLikeConsoleLine('SimpleVault.Impl.SimplePricer:SimplePricer'), false);
assert.strictEqual(webview.normalizeConsoleText('TRACE: "[Test] OK (flow + privacy)"'), '[test] ok (flow + privacy)');
assert.strictEqual(webview.mergeConsoleEntries(
  [{ text: 'TRACE: [Test] OK (flow + privacy)', severity: 'debug' }],
  [{ text: '[Test] OK (flow + privacy)', severity: 'debug' }]
).length, 1);
