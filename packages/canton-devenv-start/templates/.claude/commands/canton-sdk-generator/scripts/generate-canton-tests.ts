#!/usr/bin/env npx ts-node
/**
 * Canton Integration Test Generator
 *
 * Generates integration tests that verify the SDK can communicate with a running Canton ledger.
 * Tests are meant to run against a live ledger instance.
 *
 * Output:
 *   __tests__/ledger-setup.ts              - Ledger connection and test helpers
 *   __tests__/<project>-api.integration.test.ts  - Integration tests
 *   vitest.config.ts                       - Vitest configuration (if not exists)
 *
 * Usage: npx ts-node generate-canton-tests.ts <canton-sdk-path> <project-name>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

interface TemplateIdEntry {
  name: string;
  value: string;
}

interface WorkflowParam {
  name: string;
  type: string;
  optional: boolean;
}

interface WorkflowFunction {
  name: string;
  params: WorkflowParam[];
  returnType: string;
}

interface WorkflowNamespace {
  name: string;
  interfaces: Map<string, WorkflowParam[]>;
  functions: WorkflowFunction[];
  templateIdKey: string | null;
}

interface TypeGuardEntry {
  name: string;
  targetType: string;
}

interface MockFactoryEntry {
  name: string;
  returnType: string;
}

interface ParsedApi {
  templateIds: TemplateIdEntry[];
  workflows: WorkflowNamespace[];
  typeGuards: TypeGuardEntry[];
  mockFactories: MockFactoryEntry[];
  projectName: string;
  discoveredTypes: Set<string>;
}

// ═══════════════════════════════════════════════════════════════
// GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════

class CantonIntegrationTestGenerator {
  private apiPath: string;
  private outputDir: string;
  private projectName: string;
  private sourceFile!: ts.SourceFile;
  private templateIds: TemplateIdEntry[] = [];
  private referencedTypes = new Set<string>();

  constructor(cantonSdkPath: string, projectName: string) {
    this.apiPath = path.join(cantonSdkPath, `${projectName}-api.ts`);
    this.outputDir = cantonSdkPath;
    this.projectName = projectName;
  }

  generate(): void {
    console.log(`\n🧪 Canton Integration Test Generator`);
    console.log(`   API: ${this.apiPath}`);
    console.log(`   Output: ${this.outputDir}/__tests__/\n`);

    this.validateInputs();
    this.parseSourceFile();

    const parsed = this.parseApi();
    this.validateParsedData(parsed);

    // Generate ledger setup file (re-exports from SDK's ledger module)
    this.generateLedgerSetup();

    // Generate integration tests
    const testCode = this.generateIntegrationTests(parsed);
    this.writeTestFile(testCode, `${this.projectName}-api.integration.test.ts`);

    this.generateVitestConfig();
    this.printSummary(parsed);
  }

  private validateInputs(): void {
    if (!fs.existsSync(this.apiPath)) {
      console.error(`❌ Error: API file not found: ${this.apiPath}`);
      process.exit(1);
    }
  }

  private parseSourceFile(): void {
    try {
      const content = fs.readFileSync(this.apiPath, 'utf-8');
      this.sourceFile = ts.createSourceFile(
        this.apiPath,
        content,
        ts.ScriptTarget.Latest,
        true
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error reading API file: ${message}`);
      process.exit(1);
    }
  }

  private validateParsedData(parsed: ParsedApi): void {
    if (parsed.templateIds.length === 0) {
      console.warn(`⚠️  Warning: No TemplateIds found in API file`);
    }
    if (parsed.workflows.length === 0) {
      console.error(`❌ Error: No workflows found in API file. Is this a valid Canton API?`);
      process.exit(1);
    }
  }

  private printSummary(parsed: ParsedApi): void {
    console.log(`\n✅ Integration test generation complete!`);
    console.log(`   📊 Summary:`);
    console.log(`      - ${parsed.templateIds.length} template IDs`);
    console.log(`      - ${parsed.workflows.length} workflows: ${parsed.workflows.map(w => w.name).join(', ')}`);
    console.log(`      - ${parsed.typeGuards.length} type guards`);
    console.log(`      - ${parsed.mockFactories.length} mock factories`);
    console.log(`\n   📁 Files created:`);
    console.log(`      - __tests__/ledger-setup.ts`);
    console.log(`      - __tests__/${this.projectName}-api.integration.test.ts`);
    console.log(`      - vitest.config.ts (if not existed)`);
    console.log(`\n   🚀 Run tests:`);
    console.log(`      1. Edit .env with your TEST_PARTY value`);
    console.log(`      2. Start Canton ledger`);
    console.log(`      3. cd ${this.outputDir} && npx vitest run\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARSING METHODS
  // ═══════════════════════════════════════════════════════════════

  private parseApi(): ParsedApi {
    const templateIds = this.parseTemplateIds();
    this.templateIds = templateIds;
    const workflows = this.parseWorkflows();
    const typeGuards = this.parseTypeGuards();
    const mockFactories = this.parseMockFactories();
    const discoveredTypes = this.discoverUsedTypes();

    console.log(`   📖 Parsed API:`);
    console.log(`      - ${templateIds.length} template IDs`);
    console.log(`      - ${workflows.length} workflows`);
    console.log(`      - ${typeGuards.length} type guards`);
    console.log(`      - ${mockFactories.length} mock factories`);

    return {
      templateIds,
      workflows,
      typeGuards,
      mockFactories,
      projectName: this.projectName,
      discoveredTypes,
    };
  }

  private parseTemplateIds(): TemplateIdEntry[] {
    const entries: TemplateIdEntry[] = [];

    ts.forEachChild(this.sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === 'TemplateIds') {
            if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
              for (const prop of decl.initializer.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  const name = prop.name.text;
                  const value = prop.initializer.getText(this.sourceFile).replace(/['"]/g, '');
                  entries.push({ name, value });
                }
              }
            }
          }
        }
      }
    });

    return entries;
  }

  private parseWorkflows(): WorkflowNamespace[] {
    const workflows: WorkflowNamespace[] = [];

    ts.forEachChild(this.sourceFile, (node) => {
      if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        const namespaceName = node.name.text;
        const workflow = this.parseNamespaceAsWorkflow(node, namespaceName);

        if (workflow && this.isLikelyWorkflow(workflow)) {
          workflow.templateIdKey = this.findTemplateIdKey(namespaceName);
          workflows.push(workflow);
        }
      }
    });

    return workflows;
  }

  private isLikelyWorkflow(namespace: WorkflowNamespace): boolean {
    const hasRequestOrProposal =
      namespace.interfaces.has('Request') || namespace.interfaces.has('Proposal');
    const hasWorkflowFunctions = namespace.functions.some((f) =>
      ['request', 'propose', 'accept', 'decline', 'withdraw'].includes(f.name)
    );
    return hasRequestOrProposal || hasWorkflowFunctions;
  }

  private findTemplateIdKey(workflowName: string): string | null {
    const patterns = [
      `Workflow_${workflowName}_Request`,
      `Workflow_${workflowName}_Proposal`,
      workflowName,
    ];

    for (const pattern of patterns) {
      const found = this.templateIds.find((t) => t.name === pattern);
      if (found) return found.name;
    }

    const fuzzyMatch = this.templateIds.find(
      (t) => t.name.includes(workflowName) && t.name.includes('Workflow')
    );
    if (fuzzyMatch) return fuzzyMatch.name;

    return null;
  }

  private parseNamespaceAsWorkflow(
    node: ts.ModuleDeclaration,
    name: string
  ): WorkflowNamespace | null {
    const interfaces = new Map<string, WorkflowParam[]>();
    const functions: WorkflowFunction[] = [];

    if (node.body && ts.isModuleBlock(node.body)) {
      for (const statement of node.body.statements) {
        if (ts.isInterfaceDeclaration(statement)) {
          const interfaceName = statement.name.text;
          const params = this.parseInterfaceMembers(statement);
          interfaces.set(interfaceName, params);
        }

        if (ts.isFunctionDeclaration(statement) && statement.name) {
          const funcName = statement.name.text;
          const params = this.parseFunctionParams(statement);
          const returnType = statement.type
            ? statement.type.getText(this.sourceFile)
            : 'unknown';
          functions.push({ name: funcName, params, returnType });
        }
      }
    }

    if (interfaces.size === 0 && functions.length === 0) {
      return null;
    }

    return { name, interfaces, functions, templateIdKey: null };
  }

  private parseInterfaceMembers(node: ts.InterfaceDeclaration): WorkflowParam[] {
    const params: WorkflowParam[] = [];

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText(this.sourceFile);
        const type = member.type ? member.type.getText(this.sourceFile) : 'unknown';
        const optional = !!member.questionToken;
        params.push({ name, type, optional });
      }
    }

    return params;
  }

  private parseFunctionParams(node: ts.FunctionDeclaration): WorkflowParam[] {
    const params: WorkflowParam[] = [];

    for (const param of node.parameters) {
      if (ts.isIdentifier(param.name)) {
        const name = param.name.text;
        const type = param.type ? param.type.getText(this.sourceFile) : 'unknown';
        const optional = !!param.questionToken;
        params.push({ name, type, optional });
      }
    }

    return params;
  }

  private parseTypeGuards(): TypeGuardEntry[] {
    const guards: TypeGuardEntry[] = [];

    ts.forEachChild(this.sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === 'TypeGuards') {
            if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
              for (const prop of decl.initializer.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  const name = prop.name.text;
                  const targetType = name.replace(/^is/, '');
                  guards.push({ name, targetType });
                }
              }
            }
          }
        }
      }
    });

    return guards;
  }

  private parseMockFactories(): MockFactoryEntry[] {
    const factories: MockFactoryEntry[] = [];

    ts.forEachChild(this.sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === 'MockFactories') {
            if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
              for (const prop of decl.initializer.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  const name = prop.name.text;
                  const returnType = this.inferMockReturnType(name);
                  factories.push({ name, returnType });
                }
              }
            }
          }
        }
      }
    });

    return factories;
  }

  private discoverUsedTypes(): Set<string> {
    const types = new Set<string>();
    const content = fs.readFileSync(this.apiPath, 'utf-8');

    const coreTypes = [
      'Party', 'ContractId', 'Numeric', 'Time', 'Optional', 'Id',
      'AccountKey', 'InstrumentKey', 'HoldingFactoryKey', 'Quantity',
      'Holding', 'Account', 'Instrument', 'Contract',
    ];

    for (const type of coreTypes) {
      if (content.includes(type)) {
        types.add(type);
      }
    }

    return types;
  }

  private inferMockReturnType(factoryName: string): string {
    const typeMap: Record<string, string> = {
      party: 'Party',
      id: 'Id',
      accountKey: 'AccountKey',
      instrumentKey: 'InstrumentKey',
      holdingFactoryKey: 'HoldingFactoryKey',
      quantity: 'Quantity',
      account: 'Account',
      holding: 'Holding',
      instrument: 'Instrument',
      contract: 'Contract<T>',
    };
    return typeMap[factoryName] || 'unknown';
  }

  // ═══════════════════════════════════════════════════════════════
  // LEDGER SETUP GENERATION
  // ═══════════════════════════════════════════════════════════════

  private generateLedgerSetup(): void {
    const setupCode = `/**
 * Ledger Setup for Integration Tests
 *
 * Re-exports the SDK's ledger module for use in tests.
 * Configuration is loaded automatically from .env file by the SDK.
 *
 * To configure, edit .env in the SDK root directory:
 *   LEDGER_HOST     - Ledger JSON API host (default: localhost)
 *   LEDGER_PORT     - Ledger JSON API port (default: 7575)
 *   LEDGER_TOKEN    - JWT token for authentication (optional)
 *   TEST_PARTY      - Party identifier for tests
 */

// Re-export everything from the SDK's ledger module
export {
  config,
  CantonLedgerClient,
  createLedgerClient,
  isLedgerReachable,
  getParties,
  uniqueId,
} from '../ledger';

// Alias for backwards compatibility with test templates
export const createTestLedger = createLedgerClient;

import type { Party } from '../core/primitives';

/**
 * Wait for a condition to be true (useful for async ledger operations)
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(\`waitFor timed out after \${timeoutMs}ms\`);
}
`;

    const setupPath = path.join(this.outputDir, '__tests__', 'ledger-setup.ts');
    fs.mkdirSync(path.dirname(setupPath), { recursive: true });
    fs.writeFileSync(setupPath, setupCode);
    console.log(`   ✓ __tests__/ledger-setup.ts`);
  }

  // ═══════════════════════════════════════════════════════════════
  // INTEGRATION TEST GENERATION
  // ═══════════════════════════════════════════════════════════════

  private generateIntegrationTests(parsed: ParsedApi): string {
    this.referencedTypes.clear();

    const lines: string[] = [];

    // Generate test sections (populates referencedTypes)
    const smokeTests = this.generateSmokeTests();
    const workflowTests = parsed.workflows.map(w => this.generateWorkflowIntegrationTests(w));
    const typeGuardTests = parsed.typeGuards.length > 0
      ? this.generateTypeGuardIntegrationTests(parsed.typeGuards)
      : '';
    const queryTests = this.generateQueryHelperTests(parsed);

    // Now generate the file with correct imports
    lines.push(this.generateIntegrationHeader(parsed));
    lines.push(this.generateIntegrationImports(parsed));
    lines.push(smokeTests);
    lines.push(...workflowTests);
    if (typeGuardTests) lines.push(typeGuardTests);
    lines.push(queryTests);

    return lines.join('\n');
  }

  private generateIntegrationHeader(parsed: ParsedApi): string {
    return `/**
 * Integration Tests for ${parsed.projectName} SDK
 *
 * These tests verify the SDK can communicate with a running Canton ledger.
 *
 * Prerequisites:
 *   - Canton ledger must be running
 *   - Configure environment: LEDGER_HOST, LEDGER_PORT, LEDGER_TOKEN, TEST_PARTY
 *
 * Workflows tested: ${parsed.workflows.map(w => w.name).join(', ')}
 * Generated at: ${new Date().toISOString()}
 */

`;
  }

  private generateIntegrationImports(parsed: ParsedApi): string {
    const imports: string[] = ['TemplateIds'];

    for (const workflow of parsed.workflows) {
      imports.push(workflow.name);
    }

    if (parsed.typeGuards.length > 0) {
      imports.push('TypeGuards');
    }

    imports.push('Query');

    const typeImports: string[] = ['Party', 'ContractId', 'Contract'];
    for (const refType of this.referencedTypes) {
      if (!typeImports.includes(refType)) {
        typeImports.push(refType);
      }
    }

    return `import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import {
  ${[...imports, ...typeImports].join(',\n  ')},
} from '../${this.projectName}-api';
import {
  createTestLedger,
  isLedgerReachable,
  uniqueId,
  waitFor,
  config,
  type CantonLedgerClient,
} from './ledger-setup';

`;
  }

  private generateSmokeTests(): string {
    return `// ═══════════════════════════════════════════════════════════════
// SMOKE TESTS - Verify ledger connectivity
// ═══════════════════════════════════════════════════════════════

describe('Ledger Connectivity', () => {
  test('ledger is reachable', async () => {
    const reachable = await isLedgerReachable();
    expect(reachable).toBe(true);
  });

  test('can create ledger client', () => {
    // This will throw if TEST_PARTY is not configured
    expect(() => createTestLedger()).not.toThrow();
  });

  test('template IDs are defined', () => {
    expect(TemplateIds).toBeDefined();
    expect(Object.keys(TemplateIds).length).toBeGreaterThan(0);
  });
});

`;
  }

  private generateWorkflowIntegrationTests(workflow: WorkflowNamespace): string {
    const lines: string[] = [];
    const isProposal = workflow.interfaces.has('Proposal');
    const requestType = isProposal ? 'Proposal' : 'Request';
    const createFn = isProposal ? 'propose' : 'request';

    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(`// ${workflow.name.toUpperCase()} WORKFLOW INTEGRATION TESTS`);
    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(``);
    lines.push(`describe('${workflow.name} Workflow', () => {`);
    lines.push(`  let ledger: CantonLedgerClient;`);
    lines.push(`  let testParty: Party;`);
    lines.push(``);
    lines.push(`  beforeAll(() => {`);
    lines.push(`    ledger = createTestLedger();`);
    lines.push(`    testParty = config.testParty;`);
    lines.push(`  });`);
    lines.push(``);

    // Test: Can create request/proposal
    const requestInterface = workflow.interfaces.get(requestType);
    if (requestInterface) {
      lines.push(`  describe('${createFn}()', () => {`);
      lines.push(`    test('can create ${requestType.toLowerCase()} on ledger', async () => {`);
      lines.push(`      // Build the ${createFn} command using the SDK`);
      lines.push(`      const cmd = ${workflow.name}.${createFn}(${this.generateTestPayload(requestInterface, workflow)});`);
      lines.push(``);
      lines.push(`      // Create on ledger`);
      lines.push(`      const contractId = await ledger.create(cmd.templateId, cmd.argument);`);
      lines.push(``);
      lines.push(`      // Verify contract was created`);
      lines.push(`      expect(contractId).toBeDefined();`);
      lines.push(`      expect(typeof contractId).toBe('string');`);
      lines.push(`      expect(contractId.length).toBeGreaterThan(0);`);
      lines.push(`    });`);
      lines.push(``);
      lines.push(`    test('can query ${requestType.toLowerCase()} after creation', async () => {`);
      lines.push(`      // Create a ${requestType.toLowerCase()}`);
      lines.push(`      const cmd = ${workflow.name}.${createFn}(${this.generateTestPayload(requestInterface, workflow)});`);
      lines.push(`      await ledger.create(cmd.templateId, cmd.argument);`);
      lines.push(``);
      lines.push(`      // Query for it`);
      lines.push(`      const contracts = await ledger.query(cmd.templateId);`);
      lines.push(``);
      lines.push(`      // Should find at least one`);
      lines.push(`      expect(contracts.length).toBeGreaterThan(0);`);
      lines.push(`      expect(contracts[0].payload).toBeDefined();`);
      lines.push(`    });`);
      lines.push(`  });`);
      lines.push(``);
    }

    // Test: Withdraw choice (requester can always withdraw their own request)
    const hasWithdraw = workflow.functions.some(f => f.name === 'withdraw');
    if (hasWithdraw && requestInterface) {
      lines.push(`  describe('withdraw()', () => {`);
      lines.push(`    test('requester can withdraw their ${requestType.toLowerCase()}', async () => {`);
      lines.push(`      // Create a ${requestType.toLowerCase()}`);
      lines.push(`      const createCmd = ${workflow.name}.${createFn}(${this.generateTestPayload(requestInterface, workflow)});`);
      lines.push(`      const contractId = await ledger.create(createCmd.templateId, createCmd.argument);`);
      lines.push(``);
      lines.push(`      // Withdraw it`);
      lines.push(`      const withdrawCmd = ${workflow.name}.withdraw(contractId as ContractId<${workflow.name}.${requestType}>);`);
      lines.push(`      const result = await ledger.exercise(`);
      lines.push(`        withdrawCmd.contractId as ContractId<${workflow.name}.${requestType}>,`);
      lines.push(`        withdrawCmd.choice!,`);
      lines.push(`        withdrawCmd.argument`);
      lines.push(`      );`);
      lines.push(``);
      lines.push(`      // Verify exercise succeeded`);
      lines.push(`      expect(result).toBeDefined();`);
      lines.push(``);
      lines.push(`      // Contract should be archived (fetch returns null)`);
      lines.push(`      const fetched = await ledger.fetch(contractId as ContractId<${workflow.name}.${requestType}>);`);
      lines.push(`      expect(fetched).toBeNull();`);
      lines.push(`    });`);
      lines.push(`  });`);
      lines.push(``);
    }

    // Note about accept/decline tests requiring counterparty
    const hasAccept = workflow.functions.some(f => f.name === 'accept');
    const hasDecline = workflow.functions.some(f => f.name === 'decline');
    if (hasAccept || hasDecline) {
      lines.push(`  // NOTE: accept() and decline() tests require a counterparty with proper authorization.`);
      lines.push(`  // These would need additional setup (e.g., custodian party for CreateAccount).`);
      lines.push(`  // Implement these tests based on your specific ledger setup.`);
      lines.push(``);
      lines.push(`  describe.skip('accept() - requires counterparty setup', () => {`);
      lines.push(`    test.todo('counterparty can accept the ${requestType.toLowerCase()}');`);
      lines.push(`  });`);
      lines.push(``);
      lines.push(`  describe.skip('decline() - requires counterparty setup', () => {`);
      lines.push(`    test.todo('counterparty can decline the ${requestType.toLowerCase()}');`);
      lines.push(`  });`);
      lines.push(``);
    }

    lines.push(`});`);
    lines.push(``);

    return lines.join('\n');
  }

  private generateTestPayload(params: WorkflowParam[], workflow: WorkflowNamespace): string {
    const requiredParams = params.filter(p => !p.optional);
    if (requiredParams.length === 0) return '{}';

    const mockValues: string[] = [];
    for (const param of requiredParams) {
      const mockValue = this.getIntegrationMockValue(param.type, param.name);
      mockValues.push(`${param.name}: ${mockValue}`);
    }

    return `{\n        ${mockValues.join(',\n        ')},\n      }`;
  }

  private getIntegrationMockValue(type: string, paramName: string): string {
    const cleanType = type.replace(/\s/g, '');

    // For integration tests, use testParty where Party is expected
    if (cleanType === 'Party') {
      return 'testParty';
    }
    if (cleanType === 'AccountKey') {
      this.referencedTypes.add('AccountKey');
      return `{ custodian: testParty, owner: testParty, id: { unpack: uniqueId('account') } }`;
    }
    if (cleanType === 'InstrumentKey') {
      this.referencedTypes.add('InstrumentKey');
      return `{ depository: testParty, issuer: testParty, id: { unpack: 'USD' }, version: '1', holdingStandard: { tag: 'TransferableFungible' } }`;
    }
    if (cleanType === 'HoldingFactoryKey') {
      this.referencedTypes.add('HoldingFactoryKey');
      return `{ provider: testParty, id: { unpack: uniqueId('holding-factory') } }`;
    }
    if (cleanType === 'Quantity' || cleanType.includes('Quantity<')) {
      this.referencedTypes.add('Quantity');
      return `{ unit: { depository: testParty, issuer: testParty, id: { unpack: 'USD' }, version: '1', holdingStandard: { tag: 'TransferableFungible' } }, amount: '100.00' }`;
    }
    if (cleanType === 'Numeric' || cleanType === 'string') {
      return `'100.00'`;
    }
    if (cleanType === 'Id') {
      return `{ unpack: uniqueId('${paramName}') }`;
    }
    if (cleanType.startsWith('ContractId<')) {
      this.extractAndTrackContractIdType(cleanType);
      return `'placeholder-cid' as ${cleanType}`;
    }
    if (cleanType === 'Party[]' || cleanType.includes('Set<Party>')) {
      return '[testParty]';
    }
    if (cleanType.includes('[]') || cleanType.includes('Set<')) {
      return '[]';
    }
    if (cleanType.includes('Record<') || cleanType.includes('TextMap<')) {
      return '{}';
    }
    if (cleanType === 'boolean' || cleanType === 'Bool') {
      return 'true';
    }
    if (cleanType === 'number' || cleanType === 'Int') {
      return '0';
    }
    if (cleanType.includes('Optional<')) {
      return 'null';
    }

    return `{} as ${cleanType}`;
  }

  private extractAndTrackContractIdType(contractIdType: string): void {
    const match = contractIdType.match(/ContractId<(.+)>/);
    if (!match) return;
    const innerType = match[1];
    if (innerType === 'unknown') return;
    if (innerType.includes('.')) return;
    this.referencedTypes.add(innerType);
  }

  private generateTypeGuardIntegrationTests(typeGuards: TypeGuardEntry[]): string {
    const lines: string[] = [];

    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(`// TYPE GUARD INTEGRATION TESTS`);
    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(``);
    lines.push(`describe('TypeGuards with real ledger data', () => {`);
    lines.push(`  let ledger: CantonLedgerClient;`);
    lines.push(``);
    lines.push(`  beforeAll(() => {`);
    lines.push(`    ledger = createTestLedger();`);
    lines.push(`  });`);
    lines.push(``);

    // Generate tests for key type guards
    const keyGuards = typeGuards.filter(g =>
      ['isAccount', 'isHolding', 'isInstrument'].includes(g.name)
    );

    for (const guard of keyGuards) {
      const templateIdKey = this.getTemplateIdForType(guard.targetType);
      if (!templateIdKey) continue;

      lines.push(`  test('${guard.name}() validates real ${guard.targetType} contracts', async () => {`);
      lines.push(`    // Query ${guard.targetType} contracts from ledger`);
      lines.push(`    const contracts = await ledger.query(TemplateIds.${templateIdKey});`);
      lines.push(``);
      lines.push(`    // If we have any, verify type guard works`);
      lines.push(`    if (contracts.length > 0) {`);
      lines.push(`      for (const contract of contracts) {`);
      lines.push(`        expect(TypeGuards.${guard.name}(contract.payload)).toBe(true);`);
      lines.push(`      }`);
      lines.push(`    }`);
      lines.push(``);
      lines.push(`    // Type guard should reject invalid data`);
      lines.push(`    expect(TypeGuards.${guard.name}(null)).toBe(false);`);
      lines.push(`    expect(TypeGuards.${guard.name}({})).toBe(false);`);
      lines.push(`  });`);
      lines.push(``);
    }

    lines.push(`});`);
    lines.push(``);

    return lines.join('\n');
  }

  private getTemplateIdForType(typeName: string): string | null {
    const mapping: Record<string, string> = {
      'Account': 'Account_Account',
      'Holding': 'Holding_TransferableFungible',
      'Fungible': 'Holding_Fungible',
      'Transferable': 'Holding_Transferable',
      'TransferableFungible': 'Holding_TransferableFungible',
      'Instrument': 'Instrument_Instrument',
    };
    return mapping[typeName] || null;
  }

  private generateQueryHelperTests(parsed: ParsedApi): string {
    const lines: string[] = [];

    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(`// QUERY HELPER INTEGRATION TESTS`);
    lines.push(`// ═══════════════════════════════════════════════════════════════`);
    lines.push(``);
    lines.push(`describe('Query helpers with ledger', () => {`);
    lines.push(`  let ledger: CantonLedgerClient;`);
    lines.push(`  let testParty: Party;`);
    lines.push(``);
    lines.push(`  beforeAll(() => {`);
    lines.push(`    ledger = createTestLedger();`);
    lines.push(`    testParty = config.testParty;`);
    lines.push(`  });`);
    lines.push(``);

    lines.push(`  test('Query.accounts() produces valid query', async () => {`);
    lines.push(`    const query = Query.accounts({ owner: testParty });`);
    lines.push(`    expect(query.templateId).toBe(TemplateIds.Account_Account);`);
    lines.push(``);
    lines.push(`    // Execute against ledger`);
    lines.push(`    const results = await ledger.query(query.templateId, query.filter);`);
    lines.push(`    expect(Array.isArray(results)).toBe(true);`);
    lines.push(`  });`);
    lines.push(``);

    lines.push(`  test('Query.holdings() produces valid query', async () => {`);
    lines.push(`    const query = Query.holdings();`);
    lines.push(`    expect(query.templateId).toBe(TemplateIds.Holding_TransferableFungible);`);
    lines.push(``);
    lines.push(`    // Execute against ledger`);
    lines.push(`    const results = await ledger.query(query.templateId, query.filter);`);
    lines.push(`    expect(Array.isArray(results)).toBe(true);`);
    lines.push(`  });`);
    lines.push(``);

    lines.push(`  test('Query.instruments() produces valid query', async () => {`);
    lines.push(`    const query = Query.instruments();`);
    lines.push(`    expect(query.templateId).toBe(TemplateIds.Instrument_Instrument);`);
    lines.push(``);
    lines.push(`    // Execute against ledger`);
    lines.push(`    const results = await ledger.query(query.templateId, query.filter);`);
    lines.push(`    expect(Array.isArray(results)).toBe(true);`);
    lines.push(`  });`);
    lines.push(``);

    // Workflow request queries
    for (const workflow of parsed.workflows) {
      const isProposal = workflow.interfaces.has('Proposal');
      const queryFn = isProposal ? `dvpProposals` : `${this.camelCase(workflow.name)}Requests`;

      // Only generate if the function likely exists
      if (['accountRequests', 'transferRequests', 'creditRequests', 'dvpProposals'].includes(queryFn)) {
        lines.push(`  test('Query.${queryFn}() produces valid query', async () => {`);
        lines.push(`    const query = Query.${queryFn}();`);
        lines.push(`    expect(query.templateId).toBeDefined();`);
        lines.push(``);
        lines.push(`    // Execute against ledger`);
        lines.push(`    const results = await ledger.query(query.templateId, query.filter);`);
        lines.push(`    expect(Array.isArray(results)).toBe(true);`);
        lines.push(`  });`);
        lines.push(``);
      }
    }

    lines.push(`});`);
    lines.push(``);

    return lines.join('\n');
  }

  private camelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // FILE OUTPUT METHODS
  // ═══════════════════════════════════════════════════════════════

  private writeTestFile(testCode: string, filename: string): void {
    const testsDir = path.join(this.outputDir, '__tests__');

    try {
      fs.mkdirSync(testsDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error creating tests directory: ${message}`);
      process.exit(1);
    }

    const testFilePath = path.join(testsDir, filename);

    try {
      fs.writeFileSync(testFilePath, testCode);
      console.log(`   ✓ __tests__/${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error writing test file: ${message}`);
      process.exit(1);
    }
  }

  private generateVitestConfig(): void {
    const configPath = path.join(this.outputDir, 'vitest.config.ts');

    if (fs.existsSync(configPath)) {
      console.log(`   ⏭ vitest.config.ts (already exists)`);
      return;
    }

    const config = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Integration tests may take longer
    testTimeout: 30000,
    // Run tests sequentially to avoid ledger conflicts
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['*.ts', 'core/**/*.ts'],
      exclude: ['__tests__/**', 'vitest.config.ts'],
    },
  },
});
`;

    try {
      fs.writeFileSync(configPath, config);
      console.log(`   ✓ vitest.config.ts`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error writing vitest config: ${message}`);
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node generate-canton-tests.ts <canton-sdk-path> <project-name>');
    console.error('Example: npx ts-node generate-canton-tests.ts ./canton-sdk vault');
    process.exit(1);
  }

  const cantonSdkPath = path.resolve(args[0]);
  const projectName = args[1];

  if (!fs.existsSync(cantonSdkPath)) {
    console.error(`❌ Error: canton-sdk directory not found: ${cantonSdkPath}`);
    process.exit(1);
  }

  const generator = new CantonIntegrationTestGenerator(cantonSdkPath, projectName);
  generator.generate();
}

main();
