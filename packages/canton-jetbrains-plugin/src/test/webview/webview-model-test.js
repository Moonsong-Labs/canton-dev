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
assert.strictEqual(webview.roleDescription('field:operator'), 'Referenced by contract field operator');
assert.strictEqual(webview.classifyDisclosureState(['signatory'], true).kind, 'stakeholder');
assert.strictEqual(webview.classifyDisclosureState(['visible'], true).kind, 'divulged');
assert.strictEqual(webview.classifyDisclosureState(['operator'], false).kind, 'field');
assert.strictEqual(webview.classifyDisclosureState([], false).kind, 'hidden');
assert.strictEqual(webview.synthesizeTransactionsFromContracts([
  { id: '#1:0', transactionId: '1', archived: false, templateShort: 'A', template: 'M:A', parties: [], fields: [] },
  { id: '#2:0', transactionId: '2', archived: true, templateShort: 'B', template: 'M:B', parties: [], fields: [] }
]).length, 2);
assert.strictEqual(webview.looksLikeConsoleLine('TRACE: [Test] OK (flow + privacy)'), true);
assert.strictEqual(webview.looksLikeConsoleLine('[Test] OK (flow + privacy)'), true);
assert.strictEqual(webview.looksLikeConsoleLine('SimpleVault.Impl.SimplePricer:SimplePricer'), false);
assert.strictEqual(webview.normalizeConsoleText('TRACE: "[Test] OK (flow + privacy)"'), '[test] ok (flow + privacy)');
assert.strictEqual(webview.mergeConsoleEntries(
  [{ text: 'TRACE: [Test] OK (flow + privacy)', severity: 'debug' }],
  [{ text: '[Test] OK (flow + privacy)', severity: 'debug' }]
).length, 1);
