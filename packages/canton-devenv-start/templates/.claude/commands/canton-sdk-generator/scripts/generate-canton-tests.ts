#!/usr/bin/env npx ts-node
/**
 * Canton Test Generator
 *
 * Generates explicit test files from the generated Canton API.
 * Parses the API file to discover workflows, types, and generates comprehensive tests.
 *
 * Output:
 *   __tests__/<project>-api.test.ts  - Explicit tests for all API components
 *   vitest.config.ts                 - Vitest configuration (if not exists)
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

class CantonTestGenerator {
  private apiPath: string;
  private outputDir: string;
  private projectName: string;
  private sourceFile!: ts.SourceFile;
  private templateIds: TemplateIdEntry[] = [];
  // Track types referenced in generated test code for dynamic imports
  private referencedTypes = new Set<string>();

  constructor(cantonSdkPath: string, projectName: string) {
    this.apiPath = path.join(cantonSdkPath, `${projectName}-api.ts`);
    this.outputDir = cantonSdkPath;
    this.projectName = projectName;
  }

  generate(): void {
    console.log(`\n🧪 Canton Test Generator`);
    console.log(`   API: ${this.apiPath}`);
    console.log(`   Output: ${this.outputDir}/__tests__/\n`);

    this.validateInputs();
    this.parseSourceFile();

    const parsed = this.parseApi();
    this.validateParsedData(parsed);

    const testCode = this.generateTestCode(parsed);
    this.writeTestFile(testCode);
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
    if (parsed.typeGuards.length === 0) {
      console.warn(`⚠️  Warning: No TypeGuards found - type guard tests will be skipped`);
    }
    if (parsed.mockFactories.length === 0) {
      console.warn(`⚠️  Warning: No MockFactories found - mock factory tests will be skipped`);
    }
  }

  private printSummary(parsed: ParsedApi): void {
    console.log(`\n✅ Test generation complete!`);
    console.log(`   📊 Summary:`);
    console.log(`      - ${parsed.templateIds.length} template IDs`);
    console.log(`      - ${parsed.workflows.length} workflows: ${parsed.workflows.map(w => w.name).join(', ')}`);
    console.log(`      - ${parsed.typeGuards.length} type guards`);
    console.log(`      - ${parsed.mockFactories.length} mock factories`);
    console.log(`\n   📁 Files created:`);
    console.log(`      - __tests__/${this.projectName}-api.test.ts`);
    console.log(`      - vitest.config.ts (if not existed)`);
    console.log(`\n   🚀 Run tests with: cd ${this.outputDir} && npx vitest run\n`);
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
    if (fuzzyMatch) {
      console.warn(
        `   ⚠️  Using fuzzy match for ${workflowName}: ${fuzzyMatch.name}`
      );
      return fuzzyMatch.name;
    }

    console.warn(`   ⚠️  No TemplateId found for workflow: ${workflowName}`);
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
      } else {
        console.warn(
          `   ⚠️  Skipping complex parameter in function (destructured/rest not supported)`
        );
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
      'Party',
      'ContractId',
      'Numeric',
      'Time',
      'Optional',
      'Id',
      'AccountKey',
      'InstrumentKey',
      'HoldingFactoryKey',
      'Quantity',
      'Holding',
      'Account',
      'Instrument',
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
    const result = typeMap[factoryName];
    if (!result) {
      console.warn(`   ⚠️  Unknown MockFactory type for: ${factoryName}`);
    }
    return result || 'unknown';
  }

  // ═══════════════════════════════════════════════════════════════
  // CODE GENERATION METHODS
  // ═══════════════════════════════════════════════════════════════

  private generateTestCode(parsed: ParsedApi): string {
    // Clear referenced types from any previous run
    this.referencedTypes.clear();

    // IMPORTANT: Generate test bodies FIRST to populate referencedTypes
    // These are collected when getMockValueForType encounters ContractId<T>
    const templateIdTests = this.generateTemplateIdTests(parsed.templateIds);

    const workflowTests: string[] = [];
    for (const workflow of parsed.workflows) {
      workflowTests.push(this.generateWorkflowTests(workflow));
    }

    const typeGuardTests = parsed.typeGuards.length > 0
      ? this.generateTypeGuardTests(parsed.typeGuards)
      : '';

    const mockFactoryTests = parsed.mockFactories.length > 0
      ? this.generateMockFactoryTests(parsed.mockFactories, parsed.typeGuards)
      : '';

    // NOW generate imports - referencedTypes is fully populated
    const lines: string[] = [];
    lines.push(this.generateHeader(parsed));
    lines.push(this.generateImports(parsed));
    lines.push(templateIdTests);
    lines.push(...workflowTests);
    if (typeGuardTests) lines.push(typeGuardTests);
    if (mockFactoryTests) lines.push(mockFactoryTests);

    return lines.join('\n');
  }

  private generateHeader(parsed: ParsedApi): string {
    return `// AUTO-GENERATED - DO NOT EDIT
// Generated by generate-canton-tests.ts
// Project: ${parsed.projectName}
// Generated at: ${new Date().toISOString()}
//
// Workflows tested: ${parsed.workflows.map((w) => w.name).join(', ')}
// Template IDs: ${parsed.templateIds.length}
// Type Guards: ${parsed.typeGuards.length}
// Mock Factories: ${parsed.mockFactories.length}

`;
  }

  private generateImports(parsed: ParsedApi): string {
    const imports: string[] = ['TemplateIds'];

    for (const workflow of parsed.workflows) {
      imports.push(workflow.name);
    }

    if (parsed.typeGuards.length > 0) {
      imports.push('TypeGuards');
    }

    if (parsed.mockFactories.length > 0) {
      imports.push('MockFactories');
    }

    // Static type imports based on what's in the API
    const typeImports: string[] = [];
    if (parsed.discoveredTypes.has('ContractId')) typeImports.push('ContractId');
    if (parsed.discoveredTypes.has('Party')) typeImports.push('Party');
    if (parsed.discoveredTypes.has('Holding')) typeImports.push('Holding');

    // Add dynamically referenced types (collected during test generation)
    // These are types extracted from ContractId<T> in function parameters
    for (const refType of this.referencedTypes) {
      if (!typeImports.includes(refType)) {
        typeImports.push(refType);
      }
    }

    const allImports = [...imports, ...typeImports];

    return `import { describe, test, expect } from 'vitest';
import {
  ${allImports.join(',\n  ')},
} from '../${this.projectName}-api';

`;
  }

  private generateTemplateIdTests(templateIds: TemplateIdEntry[]): string {
    if (templateIds.length === 0) {
      return `// No TemplateIds found - skipping tests\n\n`;
    }

    const tests: string[] = [];

    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(`// TEMPLATE ID TESTS`);
    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(``);
    tests.push(`describe('TemplateIds', () => {`);

    for (const entry of templateIds) {
      tests.push(`  test('${entry.name} has correct value', () => {`);
      tests.push(`    expect(TemplateIds.${entry.name}).toBe('${entry.value}');`);
      tests.push(`    expect(typeof TemplateIds.${entry.name}).toBe('string');`);
      tests.push(`  });`);
      tests.push(``);
    }

    tests.push(`  test('all template IDs are unique', () => {`);
    tests.push(`    const values = Object.values(TemplateIds);`);
    tests.push(`    const uniqueValues = new Set(values);`);
    tests.push(`    expect(uniqueValues.size).toBe(values.length);`);
    tests.push(`  });`);
    tests.push(``);
    tests.push(`  test('all template IDs are non-empty strings', () => {`);
    tests.push(`    for (const [key, value] of Object.entries(TemplateIds)) {`);
    tests.push(`      expect(typeof value).toBe('string');`);
    tests.push(`      expect(value.length).toBeGreaterThan(0);`);
    tests.push(`    }`);
    tests.push(`  });`);
    tests.push(`});`);
    tests.push(``);

    return tests.join('\n');
  }

  private generateWorkflowTests(workflow: WorkflowNamespace): string {
    const tests: string[] = [];

    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(`// ${workflow.name.toUpperCase()} WORKFLOW TESTS`);
    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(``);
    tests.push(`describe('${workflow.name}', () => {`);

    for (const func of workflow.functions) {
      tests.push(this.generateFunctionTest(workflow, func));
    }

    tests.push(`});`);
    tests.push(``);

    return tests.join('\n');
  }

  private generateFunctionTest(
    workflow: WorkflowNamespace,
    func: WorkflowFunction
  ): string {
    const tests: string[] = [];
    const templateIdKey = workflow.templateIdKey;

    tests.push(`  describe('${func.name}()', () => {`);

    if (func.name === 'request' || func.name === 'propose') {
      const requestInterface =
        workflow.interfaces.get('Request') || workflow.interfaces.get('Proposal');
      const mockParams = this.generateMockParams(requestInterface || []);

      tests.push(`    test('returns command with correct templateId', () => {`);
      tests.push(`      const cmd = ${workflow.name}.${func.name}(${mockParams});`);
      if (templateIdKey) {
        tests.push(`      expect(cmd.templateId).toBe(TemplateIds.${templateIdKey});`);
      } else {
        tests.push(`      expect(cmd.templateId).toBeDefined();`);
        tests.push(`      expect(typeof cmd.templateId).toBe('string');`);
      }
      tests.push(`    });`);
      tests.push(``);

      tests.push(`    test('returns command with correct argument structure', () => {`);
      tests.push(`      const cmd = ${workflow.name}.${func.name}(${mockParams});`);
      tests.push(`      expect(cmd.argument).toBeDefined();`);
      tests.push(`      expect(typeof cmd.argument).toBe('object');`);
      tests.push(`    });`);

      if (requestInterface && requestInterface.length > 0) {
        const requiredParams = requestInterface.filter((p) => !p.optional);
        if (requiredParams.length > 0) {
          tests.push(``);
          tests.push(`    test('argument contains all required fields', () => {`);
          tests.push(`      const cmd = ${workflow.name}.${func.name}(${mockParams});`);
          for (const param of requiredParams) {
            tests.push(`      expect(cmd.argument).toHaveProperty('${param.name}');`);
          }
          tests.push(`    });`);
        }
      }
    } else if (func.name === 'accept') {
      // Use the ACTUAL function parameters, not interfaces
      // func.params contains the real signature from parsing the function declaration
      const contractIdType = this.getContractIdType(workflow);

      // Skip the first param (contractId) - we generate that specially
      const additionalParams = func.params.slice(1);

      tests.push(`    test('returns command with Accept choice', () => {`);
      tests.push(`      const contractId = 'test-contract-id' as ContractId<${contractIdType}>;`);

      // Generate mock variables for each additional parameter
      for (const param of additionalParams) {
        // Resolve namespace-local types (e.g., AcceptParams -> CreateAccount.AcceptParams)
        const resolvedType = this.resolveNamespaceType(param.type, workflow);
        const mockValue = this.getMockValueForNamespaceType(resolvedType, param.name, workflow);
        tests.push(`      const ${param.name} = ${mockValue};`);
      }

      // Build function call with all parameters
      const allArgs = ['contractId', ...additionalParams.map((p) => p.name)].join(', ');
      tests.push(`      const cmd = ${workflow.name}.accept(${allArgs});`);

      tests.push(`      expect(cmd.choice).toBe('Accept');`);
      tests.push(`      expect(cmd.contractId).toBe('test-contract-id');`);
      if (templateIdKey) {
        tests.push(`      expect(cmd.templateId).toBe(TemplateIds.${templateIdKey});`);
      }
      tests.push(`    });`);
    } else if (func.name === 'decline') {
      const contractIdType = this.getContractIdType(workflow);

      tests.push(`    test('returns command with Decline choice', () => {`);
      tests.push(`      const contractId = 'test-contract-id' as ContractId<${contractIdType}>;`);
      tests.push(`      const cmd = ${workflow.name}.decline(contractId);`);
      tests.push(`      expect(cmd.choice).toBe('Decline');`);
      tests.push(`      expect(cmd.contractId).toBe('test-contract-id');`);
      tests.push(`      expect(cmd.argument).toEqual({});`);
      tests.push(`    });`);
    } else if (func.name === 'withdraw') {
      const contractIdType = this.getContractIdType(workflow);

      tests.push(`    test('returns command with Withdraw choice', () => {`);
      tests.push(`      const contractId = 'test-contract-id' as ContractId<${contractIdType}>;`);
      tests.push(`      const cmd = ${workflow.name}.withdraw(contractId);`);
      tests.push(`      expect(cmd.choice).toBe('Withdraw');`);
      tests.push(`      expect(cmd.contractId).toBe('test-contract-id');`);
      tests.push(`      expect(cmd.argument).toEqual({});`);
      tests.push(`    });`);
    } else {
      tests.push(`    test('${func.name} is callable', () => {`);
      tests.push(`      expect(typeof ${workflow.name}.${func.name}).toBe('function');`);
      tests.push(`    });`);
    }

    tests.push(`  });`);
    tests.push(``);

    return tests.join('\n');
  }

  private getContractIdType(workflow: WorkflowNamespace): string {
    if (workflow.interfaces.has('Proposal')) {
      return `${workflow.name}.Proposal`;
    }
    return `${workflow.name}.Request`;
  }

  private generateMockParams(params: WorkflowParam[]): string {
    if (params.length === 0) return '{}';

    const mockValues: string[] = [];

    for (const param of params) {
      if (!param.optional) {
        const mockValue = this.getMockValueForType(param.type, param.name);
        mockValues.push(`${param.name}: ${mockValue}`);
      }
    }

    if (mockValues.length === 0) return '{}';

    return `{\n        ${mockValues.join(',\n        ')},\n      }`;
  }

  private getMockValueForType(type: string, paramName: string): string {
    const cleanType = type.replace(/\s/g, '');

    if (cleanType === 'Party') {
      return `MockFactories.party('Test${this.capitalize(paramName)}')`;
    }
    if (cleanType === 'AccountKey') {
      return 'MockFactories.accountKey()';
    }
    if (cleanType === 'InstrumentKey') {
      return 'MockFactories.instrumentKey()';
    }
    if (cleanType === 'HoldingFactoryKey') {
      return 'MockFactories.holdingFactoryKey()';
    }
    if (cleanType === 'Quantity' || cleanType.includes('Quantity<')) {
      return 'MockFactories.quantity()';
    }
    if (cleanType === 'Numeric' || cleanType === 'string') {
      return `'100.00'`;
    }
    if (cleanType === 'Id') {
      return `MockFactories.id('test-${paramName}')`;
    }
    if (cleanType.startsWith('ContractId<')) {
      // Extract and track the inner type for imports
      this.extractAndTrackContractIdType(cleanType);
      return `'test-cid' as ${cleanType}`;
    }
    if (cleanType === 'Party[]' || cleanType.includes('Set<Party>')) {
      return '[]';
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

    console.warn(`   ⚠️  Unknown type '${cleanType}' for param '${paramName}', using empty object`);
    return `{} as ${cleanType}`;
  }

  /**
   * Extract inner type from ContractId<T> and track it for imports.
   * Handles simple types (Holding), qualified types (DvP.Proposal), and unknown.
   */
  private extractAndTrackContractIdType(contractIdType: string): void {
    const match = contractIdType.match(/ContractId<(.+)>/);
    if (!match) return;

    const innerType = match[1];

    // Skip 'unknown' - doesn't need importing
    if (innerType === 'unknown') return;

    // If it's a qualified type like "DvP.Proposal", the namespace is already imported
    if (innerType.includes('.')) return;

    // Simple type like "Holding", "Batch", "Instruction" - needs to be imported
    this.referencedTypes.add(innerType);
  }

  /**
   * Resolve a type that might be namespace-local.
   * If the type exists as an interface in the workflow namespace, qualify it.
   * E.g., "AcceptParams" in CreateAccount -> "CreateAccount.AcceptParams"
   */
  private resolveNamespaceType(type: string, workflow: WorkflowNamespace): string {
    const cleanType = type.replace(/\s/g, '');

    // Check if this type is defined in the workflow's interfaces
    if (workflow.interfaces.has(cleanType)) {
      return `${workflow.name}.${cleanType}`;
    }

    return cleanType;
  }

  /**
   * Generate a mock value for a type, with awareness of namespace-local types.
   * For namespace-local interface types, generates an object with proper mock values.
   */
  private getMockValueForNamespaceType(
    type: string,
    paramName: string,
    workflow: WorkflowNamespace
  ): string {
    const cleanType = type.replace(/\s/g, '');

    // Check if this is a qualified namespace type (e.g., CreateAccount.AcceptParams)
    const namespaceMatch = cleanType.match(/^(\w+)\.(\w+)$/);
    if (namespaceMatch) {
      const [, namespaceName, interfaceName] = namespaceMatch;
      if (namespaceName === workflow.name) {
        const interfaceFields = workflow.interfaces.get(interfaceName);
        if (interfaceFields && interfaceFields.length > 0) {
          // Generate a proper mock object with all required fields
          return this.generateMockObjectForInterface(interfaceFields);
        }
      }
    }

    // Fall back to standard mock value generation
    return this.getMockValueForType(type, paramName);
  }

  /**
   * Generate a mock object literal for an interface with all its fields.
   */
  private generateMockObjectForInterface(fields: WorkflowParam[]): string {
    const requiredFields = fields.filter((f) => !f.optional);
    if (requiredFields.length === 0) return '{}';

    const mockValues: string[] = [];
    for (const field of requiredFields) {
      const mockValue = this.getMockValueForType(field.type, field.name);
      mockValues.push(`${field.name}: ${mockValue}`);
    }

    return `{\n        ${mockValues.join(',\n        ')},\n      }`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private generateTypeGuardTests(typeGuards: TypeGuardEntry[]): string {
    const tests: string[] = [];

    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(`// TYPE GUARD TESTS`);
    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(``);
    tests.push(`describe('TypeGuards', () => {`);

    for (const guard of typeGuards) {
      const mockFactory = this.getMockFactoryForType(guard.targetType);

      tests.push(`  describe('${guard.name}()', () => {`);

      if (mockFactory) {
        tests.push(`    test('returns true for valid ${guard.targetType}', () => {`);
        tests.push(`      const valid = MockFactories.${mockFactory}();`);
        tests.push(`      expect(TypeGuards.${guard.name}(valid)).toBe(true);`);
        tests.push(`    });`);
        tests.push(``);
      }

      tests.push(`    test('returns false for null', () => {`);
      tests.push(`      expect(TypeGuards.${guard.name}(null)).toBe(false);`);
      tests.push(`    });`);
      tests.push(``);
      tests.push(`    test('returns false for undefined', () => {`);
      tests.push(`      expect(TypeGuards.${guard.name}(undefined)).toBe(false);`);
      tests.push(`    });`);
      tests.push(``);
      tests.push(`    test('returns false for empty object', () => {`);
      tests.push(`      expect(TypeGuards.${guard.name}({})).toBe(false);`);
      tests.push(`    });`);
      tests.push(``);
      tests.push(`    test('returns false for random object', () => {`);
      tests.push(`      expect(TypeGuards.${guard.name}({ random: 'data' })).toBe(false);`);
      tests.push(`    });`);
      tests.push(`  });`);
      tests.push(``);
    }

    tests.push(`});`);
    tests.push(``);

    return tests.join('\n');
  }

  private getMockFactoryForType(typeName: string): string | null {
    const factoryMap: Record<string, string | null> = {
      Account: 'account',
      Holding: 'holding',
      Fungible: 'holding',
      Transferable: 'holding',
      TransferableFungible: 'holding',
      Instrument: 'instrument',
      AccountKey: 'accountKey',
      InstrumentKey: 'instrumentKey',
      Batch: null,
      Instruction: null,
    };
    return factoryMap[typeName] ?? null;
  }

  private generateMockFactoryTests(
    mockFactories: MockFactoryEntry[],
    typeGuards: TypeGuardEntry[]
  ): string {
    const tests: string[] = [];
    const availableGuards = new Set(typeGuards.map((g) => g.name));

    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(`// MOCK FACTORY TESTS`);
    tests.push(`// ═══════════════════════════════════════════════════════════════`);
    tests.push(``);
    tests.push(`describe('MockFactories', () => {`);

    for (const factory of mockFactories) {
      const defaultArgs = this.getFactoryDefaultArgs(factory.name);
      const typeGuard = this.getTypeGuardForFactory(factory.name);

      tests.push(`  describe('${factory.name}()', () => {`);
      tests.push(`    test('returns a value', () => {`);
      tests.push(`      const result = MockFactories.${factory.name}(${defaultArgs});`);
      tests.push(`      expect(result).toBeDefined();`);
      tests.push(`    });`);

      if (typeGuard && availableGuards.has(typeGuard)) {
        tests.push(``);
        tests.push(`    test('returns valid ${factory.returnType} shape', () => {`);
        tests.push(`      const result = MockFactories.${factory.name}(${defaultArgs});`);
        tests.push(`      expect(TypeGuards.${typeGuard}(result)).toBe(true);`);
        tests.push(`    });`);
      }

      tests.push(`  });`);
      tests.push(``);
    }

    tests.push(`});`);
    tests.push(``);

    return tests.join('\n');
  }

  private getFactoryDefaultArgs(factoryName: string): string {
    const argsMap: Record<string, string> = {
      party: "'TestParty'",
      id: "'test-id'",
      accountKey: '',
      instrumentKey: '',
      holdingFactoryKey: '',
      quantity: '',
      account: '',
      holding: '',
      instrument: '',
      contract: 'MockFactories.account()',
    };
    return argsMap[factoryName] ?? '';
  }

  private getTypeGuardForFactory(factoryName: string): string | null {
    const guardMap: Record<string, string | null> = {
      account: 'isAccount',
      holding: 'isHolding',
      instrument: 'isInstrument',
      accountKey: 'isAccountKey',
      instrumentKey: 'isInstrumentKey',
    };
    return guardMap[factoryName] ?? null;
  }

  // ═══════════════════════════════════════════════════════════════
  // FILE OUTPUT METHODS
  // ═══════════════════════════════════════════════════════════════

  private writeTestFile(testCode: string): void {
    const testsDir = path.join(this.outputDir, '__tests__');

    try {
      fs.mkdirSync(testsDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error creating tests directory: ${message}`);
      process.exit(1);
    }

    const testFilePath = path.join(testsDir, `${this.projectName}-api.test.ts`);

    try {
      fs.writeFileSync(testFilePath, testCode);
      console.log(`   ✓ __tests__/${this.projectName}-api.test.ts`);
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

  const generator = new CantonTestGenerator(cantonSdkPath, projectName);
  generator.generate();
}

main();
