#!/usr/bin/env npx ts-node
/**
 * Canton API Generator
 *
 * Transforms auto-generated Daml JS bindings into a clean, developer-friendly API.
 *
 * Output Structure:
 *   core/primitives.ts  - Canton/Daml primitives (Party, ContractId, Time, etc.)
 *   core/interfaces.ts  - Generic financial interfaces (Keys, Quantity, Lock, etc.)
 *   core/index.ts       - Re-exports
 *   <project>-api.ts    - Project-specific workflows with clear function signatures
 *
 * Usage: npx ts-node generate-canton-api.ts <daml-js-dir> <output-dir> [project-name]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';


// ═══════════════════════════════════════════════════════════════
// INTERMEDIATE REPRESENTATION (IR)
// ═══════════════════════════════════════════════════════════════
// Daml-agnostic IR for template classification and code generation.
// Templates are classified by STRUCTURE, not naming conventions.

/** Field definition in a template or choice */
interface FieldIR {
  name: string;
  type: string;
  description?: string;
}

/** Choice definition with structural analysis */
interface ChoiceIR {
  name: string;
  consuming: boolean;
  controllers: string[];
  /** Raw argument type for this choice (from daml-js typings, simplified) */
  argsType: string;
  params: FieldIR[];
  returnType: string;
  /** Templates created by this choice (for classification) */
  createsTemplates: string[];
  /** Does this choice archive the contract? */
  archivesSelf: boolean;
}

/** Key definition for contract lookup */
interface KeyIR {
  type: string;
  fields: string[];
}

/** Template role - classified by structural analysis */
type TemplateRole = 'workflow' | 'factory' | 'state' | 'asset';

/** Complete template IR with structural classification */
interface TemplateIR {
  templateId: string;
  modulePath: string;
  name: string;
  qualifiedName: string;
  fields: FieldIR[];
  choices: ChoiceIR[];
  key?: KeyIR;
  signatories: string[];
  observers: string[];
  /** Computed role based on structural analysis */
  role: TemplateRole;
  /** For workflows: the workflow name (e.g., "CreateAccount", "Deposit") */
  workflowName?: string;
  /** For workflows: type of request pattern */
  workflowType?: 'Request' | 'Proposal';
}

// ═══════════════════════════════════════════════════════════════
// STRUCTURAL CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if module path contains a specific segment (case-insensitive).
 * Returns the index if found, -1 otherwise.
 */
function findModuleSegment(pathParts: string[], segment: string): number {
  return pathParts.findIndex(p => p.toLowerCase() === segment.toLowerCase());
}

/**
 * Classify a template by its module path and structural characteristics.
 * Rules (in order of precedence):
 * 1. WORKFLOW: Module path contains "Workflow" (e.g., Workflow.CreateAccount)
 * 2. FACTORY: Module path contains "Factory" OR template name is "Factory"
 * 3. ASSET: Module path contains "Holding" OR has holding fields (fallback)
 * 4. STATE: Default for everything else
 */
function classifyTemplate(template: {
  name: string;
  fields: FieldIR[];
  choices: ChoiceIR[];
  modulePath: string;
}): { role: TemplateRole; workflowName?: string; workflowType?: 'Request' | 'Proposal' } {
  const pathParts = template.modulePath.split('.');

  // 1. WORKFLOW: Module path contains "Workflow"
  const workflowIndex = findModuleSegment(pathParts, 'workflow');
  if (workflowIndex >= 0) {
    const workflowName = workflowIndex < pathParts.length - 1
      ? pathParts[workflowIndex + 1]
      : template.name.replace(/Request|Proposal/, '');

    const workflowType: 'Request' | 'Proposal' =
      template.name === 'Proposal' || template.name.endsWith('Proposal') ? 'Proposal' : 'Request';

    return { role: 'workflow', workflowName, workflowType };
  }

  // 2. FACTORY: Module path contains "Factory" OR template name is "Factory"
  const isFactoryModule = findModuleSegment(pathParts, 'factory') >= 0;
  if (isFactoryModule || template.name === 'Factory') {
    return { role: 'factory' };
  }

  // 3. ASSET: Module path contains "Holding" OR has holding fields (fallback)
  const isHoldingModule = findModuleSegment(pathParts, 'holding') >= 0;
  if (isHoldingModule) {
    return { role: 'asset' };
  }

  // Fallback: field-based detection for non-standard projects
  const fieldNames = template.fields.map(f => f.name.toLowerCase());
  const hasHoldingFields = fieldNames.includes('amount') &&
    (fieldNames.includes('instrument') || fieldNames.includes('account'));
  if (hasHoldingFields) {
    return { role: 'asset' };
  }

  // 4. STATE: Default
  return { role: 'state' };
}

/**
 * Build TemplateIR from parsed module data.
 * Classification is determined by structural analysis only.
 */
function buildTemplateIR(
  parsed: {
    templateId: string;
    modulePath: string;
    name: string;
    fields: Array<{ name: string; type: string }>;
    choices: Array<{
      name: string;
      argsType: string;
      argsFields?: Array<{ name: string; type: string }>;
      result: string;
      consuming?: boolean;
    }>;
  }
): TemplateIR {
  const fields: FieldIR[] = parsed.fields.map(f => ({
    name: f.name,
    type: f.type,
  }));

  const choices: ChoiceIR[] = parsed.choices.map(c => ({
    name: c.name,
    consuming: c.consuming ?? true,
    controllers: [],
    argsType: c.argsType,
    params: (c.argsFields ?? []).map(f => ({ name: f.name, type: f.type })),
    returnType: c.result,
    createsTemplates: extractCreatedTemplates(c.result),
    archivesSelf: c.consuming ?? true,
  }));

  const qualifiedName = createQualifiedName(parsed.templateId, parsed.modulePath, parsed.name);

  const classification = classifyTemplate({
    name: parsed.name,
    fields,
    choices,
    modulePath: parsed.modulePath,
  });

  return {
    templateId: parsed.templateId,
    modulePath: parsed.modulePath,
    name: parsed.name,
    qualifiedName,
    fields,
    choices,
    signatories: [],
    observers: [],
    ...classification,
  };
}

function extractCreatedTemplates(returnType: string): string[] {
  const matches = returnType.match(/ContractId<(\w+)>/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/ContractId<|>/g, ''));
}

function isEmptyChoiceArgsType(argsType: string): boolean {
  const t = argsType.trim();
  return (
    t === '' ||
    t === '{}' ||
    t === 'void' ||
    t === 'Unit' ||
    t === 'Record<string, never>' ||
    t === 'Record<string, never> | undefined'
  );
}

function sanitizeReturnType(returnType: string): string {
  if (!returnType || returnType === 'void' || returnType === '{}' || returnType === '{') {
    return 'void';
  }

  const trimmed = returnType.trim();

  const openBrackets = (trimmed.match(/</g) || []).length;
  const closeBrackets = (trimmed.match(/>/g) || []).length;
  if (openBrackets !== closeBrackets) {
    console.warn(`⚠️  Unbalanced generics in return type: ${trimmed}`);
    return 'unknown';
  }

  if (trimmed.startsWith('Tuple2<')) {
    const inner = trimmed.match(/Tuple2<(.+)>/)?.[1];
    if (inner) {
      const parts = splitGenericArgs(inner);
      if (parts.length === 2) {
        return `[${parts[0]}, ${parts[1]}]`;
      }
    }
    return 'unknown';
  }

  if (trimmed.startsWith('Tuple3<')) {
    const inner = trimmed.match(/Tuple3<(.+)>/)?.[1];
    if (inner) {
      const parts = splitGenericArgs(inner);
      if (parts.length === 3) {
        return `[${parts[0]}, ${parts[1]}, ${parts[2]}]`;
      }
    }
    return 'unknown';
  }

  if (trimmed.match(/^ContractId<.+>$/)) {
    return trimmed;
  }

  return trimmed;
}

function splitGenericArgs(argsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if (char === '<') {
      depth++;
      current += char;
    } else if (char === '>') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function createQualifiedName(templateId: string, modulePath: string, name: string): string {
  // Use full module path to ensure uniqueness
  // This prevents collisions like multiple "Factory" templates from different modules
  const parts = templateId.split(':');
  if (parts.length >= 2) {
    const modulePathPart = parts[1];
    const pathParts = modulePathPart.split('.');
    
    // Find version marker (V1, V2, etc.) and use everything after it
    const versionIndex = pathParts.findIndex(p => /^V\d+$/.test(p));
    
    if (versionIndex !== -1 && versionIndex < pathParts.length - 1) {
      // Include ALL path parts after version for uniqueness
      // e.g., Daml.Finance.Instrument.Equity.V1.Instrument.Instrument 
      //       -> Instrument_Equity_Instrument (using parts before V and after V)
      const beforeVersion = pathParts.slice(Math.max(0, versionIndex - 1), versionIndex);
      const afterVersion = pathParts.slice(versionIndex + 1);
      
      // Combine: domain (before version) + subpath (after version) + name
      const allParts = [...beforeVersion, ...afterVersion];
      
      // Remove duplicates of the name itself
      const uniqueParts = allParts.filter((p, i) => 
        p !== name || i === allParts.length - 1
      );
      
      if (uniqueParts.length > 0 && uniqueParts[uniqueParts.length - 1] !== name) {
        return `${uniqueParts.join('_')}_${name}`;
      }
      return uniqueParts.join('_');
    }
  }

  // Fallback: use full module path
  const modulePathParts = modulePath.split('.');
  if (modulePathParts.length >= 2) {
    // Use last 3 parts for more context (or all if less than 3)
    const relevantParts = modulePathParts.slice(-3);
    const uniqueParts = relevantParts.filter((p, i) => 
      p !== name || i === relevantParts.length - 1
    );
    if (uniqueParts[uniqueParts.length - 1] !== name) {
      return `${uniqueParts.join('_')}_${name}`;
    }
    return uniqueParts.join('_');
  }

  const domain = extractDomainFromPath(modulePath);
  if (domain !== name) {
    return `${domain}_${name}`;
  }
  return name;
}

/**
 * Resolve duplicate qualified names by adding more context.
 * Call this after all templates are collected.
 */
function resolveDuplicateQualifiedNames(templates: TemplateIR[]): void {
  // Find duplicates
  const nameCount = new Map<string, TemplateIR[]>();
  for (const template of templates) {
    const existing = nameCount.get(template.qualifiedName) || [];
    existing.push(template);
    nameCount.set(template.qualifiedName, existing);
  }
  
  // Resolve duplicates by using more of the module path
  for (const [name, duplicates] of nameCount) {
    if (duplicates.length > 1) {
      for (const template of duplicates) {
        // Use the full module path split by dots, joined with underscores
        const fullPath = template.modulePath.replace(/\./g, '_');
        template.qualifiedName = `${fullPath}_${template.name}`;
      }
    }
  }
}

function extractPackageDomain(packageName: string): string | null {
  const lowerName = packageName.toLowerCase();
  const commonDomains = ['account', 'holding', 'instrument', 'settlement', 'lifecycle', 'workflow', 'token', 'factory'];

  for (const domain of commonDomains) {
    if (lowerName.includes(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  const parts = packageName.split('.');
  for (const part of parts) {
    if (part.length > 3 && /^[A-Z][a-z]+$/.test(part)) {
      return part;
    }
  }

  return null;
}

function extractDomainFromPath(modulePath: string): string {
  const parts = modulePath.split('.');

  for (const part of parts) {
    if (part.length > 3 && /^[A-Z][a-z]+$/.test(part) && !part.match(/^V\d+$/)) {
      return part;
    }
  }

  return parts[parts.length - 1] || 'Other';
}

// === PRIMITIVES (Static - never change) ===

const PRIMITIVES = `// core/primitives.ts
// Canton/Daml Primitives - Project Independent
// DO NOT EDIT - Generated by generate-canton-api.ts

/**
 * Unique identifier for a party on the Canton ledger.
 * Parties represent participants (users, institutions, services) in the network.
 * @example "Alice::1220abc123"
 */
export type Party = string;

/**
 * Type-safe contract identifier.
 * The generic parameter ensures compile-time type checking when exercising choices.
 * @example const accountCid: ContractId<Account> = "00abc123" as ContractId<Account>;
 */
export type ContractId<T> = string & { readonly __contractType: T };

/**
 * Optional value wrapper - value may be null.
 */
export type Optional<T> = T | null;

/**
 * ISO 8601 timestamp string.
 * @example "2024-01-15T10:30:00Z"
 */
export type Time = string;

/**
 * ISO 8601 date string (YYYY-MM-DD).
 * @example "2024-01-15"
 */
export type Date = string;

/**
 * Decimal number as string to preserve arbitrary precision.
 * Use for financial amounts to avoid floating point errors.
 * @example "1000.50"
 */
export type Numeric = string;

/**
 * Integer number represented as string.
 * Daml JSON encodes Int values as strings to preserve precision.
 */
export type Int = string;

/**
 * Text string.
 */
export type Text = string;

/**
 * Boolean value.
 */
export type Bool = boolean;

/**
 * Unit type - represents "no value".
 */
export type Unit = Record<string, never>;

/**
 * String-keyed map/dictionary.
 */
export type TextMap<V> = Record<string, V>;

/**
 * Generic Daml Map<K, V> representation.
 * Daml JSON API encodes Map as an array of key/value pairs.
 */
export type DamlMap<K, V> = Array<[K, V]>;

/**
 * Set represented as array (Daml sets serialize as arrays).
 */
export type Set<T> = T[];

/**
 * Contract wrapper with ID and payload.
 */
export interface Contract<T> {
  contractId: ContractId<T>;
  payload: T;
  createdAt?: Time;
}

/**
 * Query result page for paginated queries.
 */
export interface Page<T> {
  contracts: Contract<T>[];
  offset?: string;
}

/**
 * Command to be submitted to the ledger.
 * Wraps the command type for type-safe submission.
 */
export interface Command<T> {
  templateId: string;
  choice?: string;
  contractId?: string;
  argument: unknown;
  _resultType?: T;
}

/**
 * Result of exercising a choice.
 */
export interface ExerciseResult<T> {
  exerciseResult: T;
  events: unknown[];
}

/**
 * Ledger connection interface for type-safe ledger operations.
 */
export interface LedgerConnection {
  query<T>(templateId: string, filter?: Partial<T>): Promise<Contract<T>[]>;
  create<T>(templateId: string, payload: T): Promise<ContractId<T>>;
  exercise<T, R>(templateId: string, contractId: ContractId<T>, choice: string, args: unknown): Promise<ExerciseResult<R>>;
  fetch<T>(contractId: ContractId<T>): Promise<Contract<T> | null>;
}
`;

// === GENERATOR CLASS ===

class CantonApiGenerator {
  private damlJsDir: string;
  private outputDir: string;
  private projectName: string;
  private templates: TemplateIR[] = [];
  private interfaces = new Map<string, string>();
  private interfaceChoicesMap = new Map<string, Array<{ name: string; args: Array<{ name: string; type: string }>; result: string }>>();

  constructor(damlJsDir: string, outputDir: string, projectName: string) {
    this.damlJsDir = damlJsDir;
    this.outputDir = outputDir;
    this.projectName = projectName;
  }

  get workflows(): TemplateIR[] {
    return this.templates.filter(t => t.role === 'workflow');
  }

  get factories(): TemplateIR[] {
    return this.templates.filter(t => t.role === 'factory');
  }

  get assets(): TemplateIR[] {
    return this.templates.filter(t => t.role === 'asset');
  }

  get states(): TemplateIR[] {
    return this.templates.filter(t => t.role === 'state');
  }

  generate(): void {
    console.log(`\n📦 Canton API Generator`);
    console.log(`   Source: ${this.damlJsDir}`);
    console.log(`   Output: ${this.outputDir}`);
    console.log(`   Project: ${this.projectName}\n`);

    // 1. Scan and parse all modules
    this.scanModules();
    
    // 1.5. Resolve any duplicate qualified names
    resolveDuplicateQualifiedNames(this.templates);

    // 2. Generate core files
    this.generateCorePrimitives();
    this.generateCoreInterfaces();
    this.generateCoreIndex();

    // 3. Generate ledger connection files
    this.generateLedgerConfig();
    this.generateLedgerClient();
    this.generateLedgerErrors();
    this.generateLedgerRetry();
    this.generateLedgerStreaming();
    this.generateLedgerResolver();
    this.generateLedgerIndex();

    // 4. Generate utils
    this.generateUtils();

    // 5. Generate environment config files
    this.generateEnvFiles();

    // 6. Generate project API
    this.generateProjectApi();

    // 7. Generate package.json
    this.generatePackageJson();

    // 8. Generate tsconfig.json
    this.generateTsConfig();

    // 9. Generate README.md
    this.generateReadme();

    // 10. Generate .gitignore
    this.generateGitignore();

    console.log(`\n✅ Generation complete!`);
    console.log(`   Files created:`);
    console.log(`   - package.json`);
    console.log(`   - tsconfig.json`);
    console.log(`   - README.md`);
    console.log(`   - .gitignore`);
    console.log(`   - .env.example`);
    console.log(`   - core/primitives.ts, interfaces.ts, index.ts`);
    console.log(`   - ledger/config.ts, client.ts, errors.ts, retry.ts, streaming.ts, resolver.ts, index.ts`);
    console.log(`   - utils/amounts.ts, ids.ts, datetime.ts, damlMap.ts, index.ts`);
    console.log(`   - ${this.projectName}-api.ts\n`);
  }

  private scanModules(): void {
    const packages = fs.readdirSync(this.damlJsDir).filter(d => {
      const p = path.join(this.damlJsDir, d);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'lib'));
    });

    console.log(`📂 Scanning ${packages.length} packages...`);

    for (const pkg of packages) {
      this.scanPackage(pkg);
    }

    console.log(`   Found ${this.templates.length} templates`);
    console.log(`   ├── Workflows: ${this.workflows.length}`);
    console.log(`   ├── Factories: ${this.factories.length}`);
    console.log(`   ├── Assets: ${this.assets.length}`);
    console.log(`   └── State: ${this.states.length}`);
    console.log(`   Found ${this.interfaces.size} interfaces`);
  }

  private scanPackage(pkgName: string): void {
    try {
      const libDir = path.join(this.damlJsDir, pkgName, 'lib');
      if (!fs.existsSync(libDir)) return;

      this.scanDirectory(libDir, pkgName);
    } catch (error) {
      console.warn(`⚠️  Failed to scan package ${pkgName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private scanDirectory(dir: string, pkgName: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(fullPath, pkgName);
      } else if (entry.name === 'module.d.ts') {
        this.parseModuleFile(fullPath, pkgName);
      }
    }
  }

  private parseModuleFile(filePath: string, pkgName: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

      const relativePath = path.relative(path.join(this.damlJsDir, pkgName, 'lib'), filePath);
      const modulePath = path.dirname(relativePath).replace(/\//g, '.');
      const isInterface = modulePath.includes('Interface');
      const isFactoryModule = modulePath.endsWith('.Factory') || modulePath.includes('.Factory.');

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isTypeAliasDeclaration(node)) {
          this.parseTypeAlias(node, modulePath);
        } else if (ts.isInterfaceDeclaration(node)) {
          this.parseInterface(node, modulePath);
          if (isInterface && isFactoryModule) {
            this.parseInterfaceChoices(node, modulePath, pkgName, content);
          }
        } else if (ts.isVariableStatement(node)) {
          this.parseTemplateVariable(node, modulePath, pkgName, content);
        }
      });
    } catch (error) {
      console.warn(`⚠️  Failed to parse module file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseTypeAlias(node: ts.TypeAliasDeclaration, _modulePath: string): void {
    const name = node.name.text;
    const typeText = node.type ? node.type.getText() : 'unknown';

    if (this.isFinanceInterface(name)) {
      this.interfaces.set(name, this.simplifyType(typeText));
    }
  }

  private parseInterface(node: ts.InterfaceDeclaration, _modulePath: string): void {
    const name = node.name.text;
    if (name.endsWith('Interface') || name.includes('Companion')) return;

    const fields: Array<{ name: string; type: string }> = [];

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const fieldName = member.name.getText();
        const fieldType = member.type ? this.simplifyType(member.type.getText()) : 'unknown';
        fields.push({ name: fieldName, type: fieldType });
      }
    }

    if (fields.length > 0 && this.isFinanceInterface(name)) {
      let interfaceStr = `export interface ${name} {\n`;
      for (const f of fields) {
        interfaceStr += `  ${f.name}: ${f.type};\n`;
      }
      interfaceStr += `}`;
      this.interfaces.set(name, interfaceStr);
    }
  }

  private parseTemplateVariable(node: ts.VariableStatement, modulePath: string, _pkgName: string, content: string): void {
    for (const decl of node.declarationList.declarations) {
      try {
        if (!ts.isIdentifier(decl.name)) continue;

        const name = decl.name.text;
        const typeText = decl.type ? decl.type.getText() : '';

        const templateMatch = typeText.match(/Template<([^,]+),.*'#([^']+)'/);
        if (!templateMatch) continue;

        const templateId = templateMatch[2];

        const fields = this.extractTemplateFields(content, name);
        const choices = this.extractTemplateChoices(content, name);

        const templateIR = buildTemplateIR({
          templateId,
          modulePath,
          name,
          fields,
          choices,
        });

        this.templates.push(templateIR);
      } catch (error) {
        console.warn(`⚠️  Failed to parse template variable in ${modulePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private extractTemplateFields(content: string, templateName: string): Array<{ name: string; type: string }> {
    const fields: Array<{ name: string; type: string }> = [];

    // Match type declaration for template
    // Use [\s\S]*? to handle nested braces in field types (e.g., Record<string, {}> )
    const typeRegex = new RegExp(
      `export declare type ${templateName} = \\{([\\s\\S]*?)\\};`,
      'm'
    );
    const match = content.match(typeRegex);

    if (match) {
      const fieldsStr = match[1];
      const fieldRegex = /(\w+):\s*([^;]+);/g;
      let fieldMatch;

      while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
        fields.push({
          name: fieldMatch[1],
          type: this.simplifyType(fieldMatch[2].trim())
        });
      }
    }

    return fields;
  }

  private extractTemplateChoices(content: string, templateName: string): Array<{
    name: string;
    argsType: string;
    argsFields?: Array<{ name: string; type: string }>;
    result: string;
  }> {
    const choices: Array<{
      name: string;
      argsType: string;
      argsFields?: Array<{ name: string; type: string }>;
      result: string;
    }> = [];

    // Match interface declaration for choices
    // Use [\s\S]*? to match any character including newlines, and stop at } followed by 
    // whitespace and either 'export' or end of content. This handles {} inside the interface
    // (e.g., Archive choice with {} result type) without stopping prematurely.
    const interfaceRegex = new RegExp(
      `export declare interface ${templateName}Interface \\{([\\s\\S]*?)\\}\\s*(?=export|$)`,
      'm'
    );
    const match = content.match(interfaceRegex);

    if (match) {
      const interfaceStr = match[1];
      // Match each choice: ChoiceName: damlTypes.Choice<Template, Args, Result, ...>
      const choiceRegex = /(\w+):\s*damlTypes\.Choice<[^,]+,\s*([^,]+),\s*([^,>]+)/g;
      let choiceMatch;

      while ((choiceMatch = choiceRegex.exec(interfaceStr)) !== null) {
        const choiceName = choiceMatch[1];
        if (choiceName === 'Archive') continue; // Skip Archive, it's standard

        const argsType = this.simplifyType(choiceMatch[2].trim());
        const argsFields =
          isEmptyChoiceArgsType(argsType) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(argsType)
            ? []
            : this.extractChoiceArgsFields(content, argsType);

        choices.push({
          name: choiceName,
          argsType,
          argsFields,
          result: this.simplifyComplexResult(choiceMatch[3].trim()),
        });
      }
    }

    return choices;
  }

  private parseInterfaceChoices(node: ts.InterfaceDeclaration, _modulePath: string, _pkgName: string, content: string): void {
    const name = node.name.text;

    // Only process FactoryInterface declarations (not ReferenceInterface)
    if (name !== 'FactoryInterface') return;

    // Extract the interface ID from the companion declaration
    // Look for: InterfaceCompanion<Factory, undefined, 'hash:Module.Path:Factory'>
    const interfaceIdMatch = content.match(/InterfaceCompanion<Factory,[^,]+,\s*'([^']+)'/);
    if (!interfaceIdMatch) return;

    const interfaceId = interfaceIdMatch[1];
    const choices: Array<{ name: string; args: Array<{ name: string; type: string }>; result: string }> = [];

    // Parse the interface members for Choice declarations
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const choiceName = member.name.getText();
        if (choiceName === 'Archive') continue;

        const typeText = member.type ? member.type.getText() : '';
        // Match: damlTypes.Choice<Factory, ArgsType, ResultType, ...>
        const choiceMatch = typeText.match(/Choice<[^,]+,\s*([^,]+),\s*([^,>]+)/);
        if (choiceMatch) {
          const argsTypeName = this.simplifyType(choiceMatch[1].trim());
          const resultType = this.simplifyComplexResult(choiceMatch[2].trim());

          // Extract the args type fields from the content
          const argsFields = this.extractChoiceArgsFields(content, argsTypeName);

          choices.push({
            name: choiceName,
            args: argsFields,
            result: resultType
          });
        }
      }
    }

    if (choices.length > 0) {
      this.interfaceChoicesMap.set(interfaceId, choices);
    }
  }

  private extractChoiceArgsFields(content: string, argsTypeName: string): Array<{ name: string; type: string }> {
    const fields: Array<{ name: string; type: string }> = [];

    // Match type declaration: export declare type ArgsType = { field: Type; ... }
    // Use [\s\S]*? to handle nested braces in field types
    const typeRegex = new RegExp(
      `export declare type ${argsTypeName} = \\{([\\s\\S]*?)\\};`,
      'm'
    );
    const match = content.match(typeRegex);

    if (match) {
      const fieldsStr = match[1];
      const fieldRegex = /(\w+):\s*([^;]+);/g;
      let fieldMatch;

      while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
        fields.push({
          name: fieldMatch[1],
          type: this.simplifyType(fieldMatch[2].trim())
        });
      }
    }

    return fields;
  }

  private simplifyType(typeText: string): string {
    let result = typeText;

    // Remove package prefixes (pkg...)
    result = result.replace(/pkg[a-f0-9]+\./g, '');

    // Simplify common Daml Finance paths
    result = result.replace(/Daml\.Finance\.Interface\.Types\.Common\.V\d+\.Types\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Settlement\.V\d+\.\w+\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Holding\.V\d+\.\w+\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Account\.V\d+\.\w+\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Instrument\.Token\.V\d+\.\w+\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Instrument\.Base\.V\d+\.\w+\./g, '');
    result = result.replace(/Daml\.Finance\.Interface\.Lifecycle\.V\d+\.\w+\./g, '');
    result = result.replace(/DA\.Types\./g, '');
    result = result.replace(/DA\.Internal\.Template\./g, '');

    // Handle Daml.Finance.Interface paths with Lock, View, Factory, Holding (extract last component)
    result = result.replace(/Daml\.Finance\.Interface\.[\w.]+\.(Lock|View|Factory|Holding|Hierarchy)/g, '$1');

    // Simplify underscore-separated module references (from TS imports)
    result = result.replace(/Daml_Finance_Interface_\w+_V\d+_\w+\./g, '');
    
    // Handle ContingentClaims namespace (used in structured products)
    result = result.replace(/ContingentClaims\.Core\.[\w.]+\./g, '');
    result = result.replace(/ContingentClaims\.[\w.]+\./g, '');
    
    // Handle remaining Daml namespace references
    result = result.replace(/Daml\.[\w.]+\./g, '');
    
    // Handle GHC internal types
    result = result.replace(/GHC\.[\w.]+\./g, '');

    // Replace damlTypes primitives
    result = result.replace(/damlTypes\.Party/g, 'Party');
    result = result.replace(/damlTypes\.ContractId/g, 'ContractId');
    result = result.replace(/damlTypes\.Numeric/g, 'Numeric');
    result = result.replace(/damlTypes\.Time/g, 'Time');
    result = result.replace(/damlTypes\.Date/g, 'Date');
    result = result.replace(/damlTypes\.Text/g, 'Text');
    result = result.replace(/damlTypes\.Int/g, 'Int');
    result = result.replace(/damlTypes\.Bool/g, 'Bool');
    result = result.replace(/damlTypes\.Optional/g, 'Optional');

    // Handle Daml map types:
    // - TextMap: JSON object keyed by string
    // - Map: JSON array of [key, value] pairs
    result = result.replace(/damlTypes\.TextMap/g, 'TextMap');
    result = result.replace(/damlTypes\.Map<([^,]+),\s*([^>]+)>/g, 'DamlMap<$1, $2>');
    // Some daml-js typings expose Map without the damlTypes. prefix
    result = result.replace(/\bMap</g, 'DamlMap<');

    // Simplify DamlMap<string, Set<Party>> to DamlMap<string, Party[]>
    result = result.replace(/DamlMap<string,\s*DA\.Set\.Types\.Set<Party>>/g, 'DamlMap<string, Party[]>');
    result = result.replace(/DamlMap<string,\s*Set<Party>>/g, 'DamlMap<string, Party[]>');

    // Simplify Set<Party> to Party[]
    result = result.replace(/DA\.Set\.Types\.Set<Party>/g, 'Party[]');
    result = result.replace(/Set<Party>/g, 'Party[]');

    // Handle Tuple2/Tuple3 in type positions (convert to TypeScript tuple syntax)
    result = result.replace(/Tuple2<([^,]+),\s*([^>]+)>/g, '[$1, $2]');
    result = result.replace(/Tuple3<([^,]+),\s*([^,]+),\s*([^>]+)>/g, '[$1, $2, $3]');

    // Handle ContractId with unresolved/interface types (replace with unknown)
    result = result.replace(/ContractId<(Factory|RouteProvider|Settler|Instructor|BatchFactory|InstructionFactory)>/g, 'ContractId<unknown>');

    // Handle Token type conflict (Token type vs Token namespace)
    // Only replace standalone "Token" that's a type (not "TokenFactory" etc.)
    if (result === 'Token') {
      result = 'TokenData';
    }

    // Handle View types for references
    if (result === 'View') {
      result = 'AccountView';
    }

    // Clean up arrays
    result = result.replace(/(\w+)\[\]/g, '$1[]');

    return result.trim();
  }

  private simplifyComplexResult(typeText: string): string {
    let result = this.simplifyType(typeText);

    // Handle Tuple types
    if (result.includes('Tuple3<')) {
      // Extract inner types and format nicely
      const tupleMatch = result.match(/Tuple3<([^>]+)>/);
      if (tupleMatch) {
        result = `[${tupleMatch[1]}]`;
      }
    }

    // Handle empty object
    if (result === '{}') {
      result = 'void';
    }

    return result;
  }

  private isFinanceInterface(name: string): boolean {
    if (name.endsWith('Key') || name.endsWith('View')) {
      return true;
    }

    const corePatterns = [
      /^Id$/,
      /^Lock$/,
      /^Quantity$/,
      /^Controllers?$/,
      /Step$/,
      /^Hierarchy$/,
      /Adjustment$/,
      /^Period$/,
      /Schedule$/,
      /Offset$/,
      /Calendar/,
      /^Frequency$/
    ];

    return corePatterns.some(pattern => pattern.test(name));
  }

  private generateCorePrimitives(): void {
    const outputPath = path.join(this.outputDir, 'core', 'primitives.ts');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, PRIMITIVES);
    console.log(`   ✓ core/primitives.ts`);
  }

  private generateCoreInterfaces(): void {
    let output = `// core/interfaces.ts
// Canton/Daml Finance Interfaces - Project Independent
// DO NOT EDIT - Generated by generate-canton-api.ts

import { Party, ContractId, Optional, Numeric, Time, TextMap, Set } from './primitives';

// ═══════════════════════════════════════════════════════════════
// IDENTIFIERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generic identifier wrapper.
 * Wraps a string ID for type safety.
 */
export interface Id {
  unpack: string;
}

/**
 * Unique identifier for an account.
 * Combines custodian, owner, and account ID.
 */
export interface AccountKey {
  /** Party responsible for custody */
  custodian: Party;
  /** Beneficial owner of the account */
  owner: Party;
  /** Unique ID within custodian namespace */
  id: Id;
}

/**
 * Unique identifier for a financial instrument.
 * Instruments are versioned to support lifecycle events.
 */
export interface InstrumentKey {
  /** Party responsible for safekeeping */
  depository: Party;
  /** Party that issued the instrument */
  issuer: Party;
  /** Unique identifier (e.g., 'USD', 'AAPL') */
  id: Id;
  /** Version for lifecycle changes */
  version: string;
  /** Supported holding behaviors */
  holdingStandard: HoldingStandard;
}

/**
 * Unique identifier for a holding factory.
 */
export interface HoldingFactoryKey {
  provider: Party;
  id: Id;
}

/**
 * Unique identifier for a settlement instruction.
 */
export interface InstructionKey {
  instructor: Party;
  batchId: Id;
  id: Id;
}

// ═══════════════════════════════════════════════════════════════
// FINANCIAL TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Generic quantity with unit and amount.
 * The unit is typically an InstrumentKey for financial quantities.
 * @example { unit: usdInstrument, amount: "1000.00" }
 */
export interface Quantity<U = InstrumentKey, A = Numeric> {
  unit: U;
  amount: A;
}

/**
 * Account controller configuration.
 * Defines which parties can authorize debits and credits.
 */
export interface Controllers {
  /** Parties that can authorize outgoing transfers (debits) */
  outgoing: Set<Party>;
  /** Parties that can authorize incoming transfers (credits) */
  incoming: Set<Party>;
}

/**
 * Lock on a contract preventing certain operations.
 * Used during settlement for atomicity guarantees.
 */
export interface Lock {
  /** Parties holding the lock */
  lockers: Set<Party>;
  /** Context identifiers for the lock */
  context: Set<string>;
  /** Type of lock behavior */
  lockType: LockType;
}

/**
 * Settlement step with routing information.
 * Specifies sender, receiver, custodian, and quantity.
 */
export interface RoutedStep {
  sender: Party;
  receiver: Party;
  custodian: Party;
  quantity: Quantity;
}

/**
 * Settlement step without routing (custodian TBD).
 */
export interface Step {
  sender: Party;
  receiver: Party;
  quantity: Quantity;
}

/**
 * Custodian hierarchy for settlement routing.
 */
export interface Hierarchy {
  rootCustodian: Party;
  pathsToRootCustodian: Party[][];
}

// ═══════════════════════════════════════════════════════════════
// DATE/TIME TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Business day adjustment for date calculations.
 */
export interface BusinessDayAdjustment {
  calendarIds: string[];
  convention: BusinessDayConventionEnum;
}

/**
 * Holiday calendar definition.
 */
export interface HolidayCalendarData {
  id: string;
  weekend: DayOfWeek[];
  holidays: string[];
}

/**
 * Date offset for schedule calculations.
 */
export interface DateOffset {
  period: PeriodEnum;
  periodMultiplier: number;
  dayType: Optional<DayTypeEnum>;
  businessDayConvention: BusinessDayConventionEnum;
  businessCenters: string[];
}

/**
 * Time period definition.
 */
export interface Period {
  period: PeriodEnum;
  periodMultiplier: number;
}

/**
 * Schedule frequency with roll convention.
 */
export interface Frequency {
  period: Period;
  rollConvention: RollConventionEnum;
}

/**
 * Single period in a schedule.
 */
export interface SchedulePeriod {
  adjustedEndDate: string;
  adjustedStartDate: string;
  unadjustedEndDate: string;
  unadjustedStartDate: string;
  stubType: Optional<StubPeriodTypeEnum>;
}

/**
 * Periodic schedule definition.
 */
export interface PeriodicSchedule {
  effectiveDate: string;
  terminationDate: string;
  firstRegularPeriodStartDate: Optional<string>;
  lastRegularPeriodEndDate: Optional<string>;
  frequency: Frequency;
  businessDayAdjustment: BusinessDayAdjustment;
  effectiveDateBusinessDayAdjustment: Optional<BusinessDayAdjustment>;
  terminationDateBusinessDayAdjustment: Optional<BusinessDayAdjustment>;
  stubPeriodType: Optional<StubPeriodTypeEnum>;
}

// ═══════════════════════════════════════════════════════════════
// ENUMS (Opaque types - actual values depend on Daml model)
// ═══════════════════════════════════════════════════════════════

// NOTE: Daml JSON encodes enums as strings (not { tag, value } objects).
// Variants encode as { tag, value }. We model these as strings because Daml Finance commonly uses enums here.
export type HoldingStandard = string;
export type LockType = string;
// Allocation / Approval can be complex Daml types depending on the model (record/variant/enum).
// Keep them opaque to avoid encouraging the wrong JSON encoding.
export type Allocation = unknown;
export type Approval = unknown;
export type BusinessDayConventionEnum = string;
export type DayOfWeek = string;
export type PeriodEnum = string;
export type DayTypeEnum = string;
export type StubPeriodTypeEnum = string;
export type RollConventionEnum = string;
`;

    const outputPath = path.join(this.outputDir, 'core', 'interfaces.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ core/interfaces.ts`);
  }

  private generateCoreIndex(): void {
    const output = `// core/index.ts
// Re-exports all core types
// DO NOT EDIT - Generated by generate-canton-api.ts

export * from './primitives';
export * from './interfaces';
`;

    const outputPath = path.join(this.outputDir, 'core', 'index.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ core/index.ts`);
  }

  private generateEnvFiles(): void {
    const envContent = `# Canton Ledger Connection Configuration
# Copy this file to .env and adjust values for your environment
# These defaults work for local Canton development

# Ledger JSON API host
LEDGER_HOST=localhost

# Ledger JSON API port
LEDGER_PORT=7575

# JWT token for authentication (leave empty if not using auth)
LEDGER_TOKEN=
`;

    // Write .env.example
    const examplePath = path.join(this.outputDir, '.env.example');
    fs.writeFileSync(examplePath, envContent);
    console.log(`   ✓ .env.example`);

    // Write .env if it doesn't exist
    const envPath = path.join(this.outputDir, '.env');
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, envContent);
      console.log(`   ✓ .env (created from example)`);
    } else {
      console.log(`   ⏭ .env (already exists)`);
    }
  }

  private generateLedgerConfig(): void {
    const output = `// ledger/config.ts
// Canton Ledger Configuration
// DO NOT EDIT - Generated by generate-canton-api.ts

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Canton ledger connection configuration.
 * Pass these values when creating a ledger client.
 */
export interface LedgerConfig {
  /** Ledger JSON API host (default: localhost) */
  host: string;
  /** Ledger JSON API port (default: 7575) */
  port: number;
  /** Full ledger URL (computed from host:port if not provided) */
  ledgerUrl?: string;
  /** Authentication token (optional - auto-generated if not provided) */
  token?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Ledger ID for JWT claims (default: sandbox) */
  ledgerId?: string;
  /** Application ID for JWT claims (default: ${this.projectName}-sdk) */
  applicationId?: string;
}

/**
 * Create a ledger configuration with defaults.
 */
export function createConfig(options: Partial<LedgerConfig> = {}): LedgerConfig {
  const host = options.host ?? 'localhost';
  const port = options.port ?? 7575;
  return {
    host,
    port,
    ledgerUrl: options.ledgerUrl ?? \`http://\${host}:\${port}\`,
    token: options.token,
    timeout: options.timeout ?? 30000,
    ledgerId: options.ledgerId ?? 'sandbox',
    applicationId: options.applicationId ?? '${this.projectName}-sdk',
  };
}

/**
 * Default configuration for local development.
 */
export const defaultConfig: LedgerConfig = createConfig();

/**
 * Create config from environment variables (Node.js only).
 * Use this in Node.js environments where process.env is available.
 */
export function createConfigFromEnv(): LedgerConfig {
  const env = typeof process !== 'undefined' ? process.env : {};
  return createConfig({
    host: env.LEDGER_HOST || 'localhost',
    port: parseInt(env.LEDGER_PORT || '7575', 10),
    token: env.LEDGER_TOKEN,
    timeout: env.LEDGER_TIMEOUT ? parseInt(env.LEDGER_TIMEOUT, 10) : undefined,
    ledgerId: env.LEDGER_ID || 'sandbox',
    applicationId: env.APPLICATION_ID || '${this.projectName}-sdk',
  });
}

// ═══════════════════════════════════════════════════════════════
// JWT AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Options for JWT token generation.
 */
export interface JwtOptions {
  /** Ledger ID - must match Canton config (default: "sandbox") */
  ledgerId?: string;
  /** Application identifier (default: "${this.projectName}-sdk") */
  applicationId?: string;
  /** Token expiration in seconds (default: 86400 = 24h) */
  expiresIn?: number;
}

/**
 * Generate an unsigned JWT for Canton sandbox authentication.
 * 
 * Canton JSON API requires JWTs with Daml-specific claims under the
 * "https://daml.com/ledger-api" namespace.
 * 
 * WARNING: This generates unsigned tokens suitable only for development.
 * Production deployments require properly signed JWTs.
 * 
 * @param party - The party ID to act as (e.g., "Alice::1220abc...")
 * @param options - JWT configuration options
 * @returns JWT token string in format "header.payload." (trailing dot for empty signature)
 * 
 * @example
 * const token = createJwtToken('Alice::1220abc123');
 * // Use with ledger client
 * const ledger = new CantonLedgerClient(party, { token });
 */
export function createJwtToken(party: string, options: JwtOptions = {}): string {
  const header = { alg: 'none', typ: 'JWT' };
  
  const payload = {
    'https://daml.com/ledger-api': {
      ledgerId: options.ledgerId || 'sandbox',
      actAs: [party],
      readAs: [party],
      applicationId: options.applicationId || '${this.projectName}-sdk',
    },
    exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 86400),
    iat: Math.floor(Date.now() / 1000),
  };
  
  // Base64url encoding (NOT standard base64!)
  // Must replace: = with nothing, + with -, / with _
  const base64url = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    const g = globalThis as any;
    let base64: string;
    if (g.Buffer?.from) {
      base64 = g.Buffer.from(json, 'utf8').toString('base64');
    } else if (typeof btoa !== 'undefined') {
      // btoa expects latin1; encode UTF-8 first
      base64 = btoa(unescape(encodeURIComponent(json)));
    } else {
      throw new Error('No base64 encoder available');
    }
    return base64.replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  };
  
  // Format: header.payload. (trailing dot = empty signature, required!)
  return \`\${base64url(header)}.\${base64url(payload)}.\`;
}
`;

    const outputPath = path.join(this.outputDir, 'ledger', 'config.ts');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/config.ts`);
  }

  private generateLedgerClient(): void {
    const output = `// ledger/client.ts
// Canton JSON API Client
// DO NOT EDIT - Generated by generate-canton-api.ts

import type { LedgerConfig } from './config';
import { createConfig, defaultConfig, createJwtToken } from './config';
import { PackageResolver, getPackageResolver } from './resolver';
import type {
  LedgerConnection,
  Contract,
  ContractId,
  ExerciseResult,
  Party
} from '../core/primitives';
import {
  ConnectionError,
  TimeoutError,
  UnauthorizedError,
  LedgerError,
  LedgerErrorCode,
} from './errors';

// ═══════════════════════════════════════════════════════════════
// CANTON LEDGER CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * Canton JSON API client implementing LedgerConnection interface.
 * Uses the standard Canton JSON API endpoints.
 * 
 * Features:
 * - Automatic JWT token generation for Canton sandbox
 * - Runtime package hash resolution for template IDs
 * - Type-safe contract operations
 *
 * @example
 * \`\`\`ts
 * import { CantonLedgerClient } from './ledger';
 *
 * // With explicit URL (auto-generates JWT, auto-resolves package hashes)
 * const ledger = new CantonLedgerClient('alice::1220...', 'http://localhost:7575');
 *
 * // With config object
 * const ledger = new CantonLedgerClient('alice::1220...', { host: 'localhost', port: 7575 });
 * 
 * // With custom token
 * const ledger = new CantonLedgerClient('alice::1220...', { token: mySignedJwt });
 * \`\`\`
 */
export class CantonLedgerClient implements LedgerConnection {
  private baseUrl: string;
  private headers: Record<string, string>;
  private party: Party;
  private timeout: number;
  private resolver: PackageResolver;

  /**
   * Create a new Canton ledger client.
   * @param party - The party identity to act as (required)
   * @param urlOrConfig - Ledger URL string or LedgerConfig object
   * @param token - Auth token (only used when urlOrConfig is a string). Auto-generated if not provided.
   */
  constructor(party: Party, urlOrConfig?: string | Partial<LedgerConfig>, token?: string) {
    if (!party) {
      throw new Error('Party is required to create a ledger client');
    }
    this.party = party;

    let resolvedUrl: string;
    let resolvedToken: string | undefined;
    let resolvedTimeout: number;
    let ledgerId: string | undefined;
    let applicationId: string | undefined;

    if (typeof urlOrConfig === 'string') {
      resolvedUrl = urlOrConfig;
      resolvedToken = token;
      resolvedTimeout = defaultConfig.timeout ?? 30000;
    } else {
      const config = { ...defaultConfig, ...urlOrConfig };
      resolvedUrl = config.ledgerUrl ?? \`http://\${config.host}:\${config.port}\`;
      resolvedToken = config.token;
      resolvedTimeout = config.timeout ?? 30000;
      ledgerId = config.ledgerId;
      applicationId = config.applicationId;
    }

    // Normalize to avoid double slashes when concatenating paths
    this.baseUrl = resolvedUrl.endsWith('/') ? resolvedUrl.slice(0, -1) : resolvedUrl;
    this.timeout = resolvedTimeout;
    
    // Auto-generate JWT if no token provided (required for Canton sandbox)
    const authToken = resolvedToken || createJwtToken(party, { ledgerId, applicationId });
    
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${authToken}\`,
    };
    
    // Use shared package resolver for efficient caching across clients
    this.resolver = getPackageResolver();
  }

  /** Get the party this client is acting as */
  getParty(): Party {
    return this.party;
  }
  
  /** Get the package resolver for advanced usage */
  getResolver(): PackageResolver {
    return this.resolver;
  }

  /**
   * Resolve a template ID from package name format to package hash format.
   * Called automatically by query, create, and exercise methods.
   */
  private async resolveTemplateId(templateId: string): Promise<string> {
    return this.resolver.resolveTemplateId(templateId, this.baseUrl, this.headers);
  }

  /**
   * Perform a JSON API request with timeout, returning the unwrapped result.
   * The JSON API wraps responses in { status, result } or { status, errors }.
   */
  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, this.timeout || 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.baseUrl + path, {
        ...init,
        headers: {
          ...this.headers,
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      const unwrap = (obj: unknown): unknown => {
        if (obj && typeof obj === 'object' && 'result' in (obj as Record<string, unknown>)) {
          return (obj as { result: unknown }).result;
        }
        return obj;
      };

      // Some JSON API deployments return 200 with an errors field.
      // Treat that as a failure even if HTTP status is OK.
      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if ('errors' in record && record.errors) {
          throw new LedgerError(
            path + ' failed: ' + JSON.stringify(record.errors),
            LedgerErrorCode.INVALID_ARGUMENT,
            record.errors
          );
        }
      }

      if (!response.ok) {
        const details = payload;
        const msg = (() => {
          if (details && typeof details === 'object') {
            const record = details as Record<string, unknown>;
            if ('errors' in record) return JSON.stringify(record.errors);
            if ('ledgerApiError' in record) return JSON.stringify(record.ledgerApiError);
          }
          return typeof details === 'string' ? details : JSON.stringify(details);
        })();

        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedError(msg || ('Unauthorized (' + response.status + ')'), details);
        }
        if (response.status === 504) {
          throw new TimeoutError(msg || 'Request timed out', details);
        }

        const code =
          response.status >= 500
            ? LedgerErrorCode.CONNECTION_FAILED
            : LedgerErrorCode.INVALID_ARGUMENT;

        throw new LedgerError(path + ' failed: ' + response.status + ' - ' + msg, code, details);
      }

      return unwrap(payload) as T;
    } catch (error) {
      if (error instanceof LedgerError) {
        throw error;
      }

      if (error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError') {
        throw new TimeoutError('Request timed out');
      }

      throw new ConnectionError('Network error connecting to ledger', error);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Query contracts by template ID with optional filter.
   * Template IDs are automatically resolved from package names to hashes.
   */
  async query<T>(templateId: string, filter?: Partial<T>): Promise<Contract<T>[]> {
    // Resolve package name to hash
    const resolvedTemplateId = await this.resolveTemplateId(templateId);

    const result = await this.requestJson<Array<{ contractId: string; payload: T; createdAt?: string }>>(
      '/v1/query',
      {
        method: 'POST',
        body: JSON.stringify({
          templateIds: [resolvedTemplateId],
          query: filter || {},
        }),
      }
    );

    return (result || []).map((item) => ({
      contractId: item.contractId as ContractId<T>,
      payload: item.payload,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Create a new contract.
   * Template IDs are automatically resolved from package names to hashes.
   */
  async create<T>(templateId: string, payload: T): Promise<ContractId<T>> {
    // Resolve package name to hash
    const resolvedTemplateId = await this.resolveTemplateId(templateId);

    const result = await this.requestJson<{ contractId: string }>('/v1/create', {
      method: 'POST',
      body: JSON.stringify({
        templateId: resolvedTemplateId,
        payload,
        meta: {
          actAs: [this.party],
        },
      }),
    });

    return result.contractId as ContractId<T>;
  }

  /**
   * Exercise a choice on a contract.
   * Template IDs are automatically resolved from package names to hashes.
   */
  async exercise<T, R>(
    templateId: string,
    contractId: ContractId<T>,
    choice: string,
    args: unknown
  ): Promise<ExerciseResult<R>> {
    // Resolve package name to hash
    const resolvedTemplateId = await this.resolveTemplateId(templateId);

    const data = await this.requestJson<{ exerciseResult: R; events?: unknown[] }>('/v1/exercise', {
      method: 'POST',
      body: JSON.stringify({
        templateId: resolvedTemplateId,
        contractId,
        choice,
        argument: args,
        meta: {
          actAs: [this.party],
        },
      }),
    });

    return {
      exerciseResult: data.exerciseResult,
      events: data.events || [],
    };
  }

  /**
   * Fetch a specific contract by ID.
   */
  async fetch<T>(contractId: ContractId<T>): Promise<Contract<T> | null> {
    // JSON API returns 200 with { result: null } when not found
    const data = await this.requestJson<{ contractId: string; payload: T; createdAt?: string } | null>(
      '/v1/fetch',
      {
        method: 'POST',
        body: JSON.stringify({ contractId }),
      }
    );

    if (!data) return null;
    return {
      contractId: data.contractId as ContractId<T>,
      payload: data.payload,
      createdAt: data.createdAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a ledger client using configuration.
 * @param party - The party identity to act as (required)
 * @param config - Optional configuration (defaults to localhost:7575)
 */
export function createLedgerClient(party: Party, config?: Partial<LedgerConfig>): CantonLedgerClient {
  const fullConfig = createConfig(config);
  return new CantonLedgerClient(party, fullConfig);
}

/**
 * Check if the ledger is reachable.
 * @param config - Configuration to use for the request
 */
export async function isLedgerReachable(config?: Partial<LedgerConfig>): Promise<boolean> {
  try {
    const fullConfig = createConfig(config);
    // Reachability check should NOT depend on having a token or a known party.
    // Treat 401/403 as "reachable but unauthorized".
    const response = await fetch(\`\${fullConfig.ledgerUrl}/v1/packages\`, { method: 'GET' });
    return response.ok || response.status === 401 || response.status === 403;
  } catch {
    return false;
  }
}

/**
 * Get all parties from the ledger.
 * @param config - Configuration to use for the request
 */
export async function getParties(config?: Partial<LedgerConfig>): Promise<Party[]> {
  const fullConfig = createConfig(config);
  const token = fullConfig.token;
  if (!token) {
    throw new Error(
      'getParties requires config.token (LEDGER_TOKEN). ' +
        'The Canton JSON API requires a Bearer token even to list parties. ' +
        'See the generated SDK README section \"JSON API Auth (curl)\" for a copy-pasteable token snippet.'
    );
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${token}\`,
  };
  const response = await fetch(\`\${fullConfig.ledgerUrl}/v1/parties\`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(\`Failed to get parties: \${response.status}\`);
  }

  // Canton returns objects with identifier, not plain strings
  interface PartyInfo {
    identifier: string;
    isLocal?: boolean;
  }
  const data = await response.json() as { result?: PartyInfo[] };
  return (data.result || []).map(p => p.identifier as Party);
}

/**
 * Generate a unique ID for test isolation.
 */
export function uniqueId(prefix: string = 'test'): string {
  return \`\${prefix}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
}

/**
 * Resolve a party name to its full party identifier.
 *
 * Canton party identifiers have the format "Name::1220abc...".
 * This function takes a simple name like "Alice" and resolves it
 * to the full identifier by querying the ledger.
 *
 * @param partyName - Simple party name (e.g., "Alice") or full identifier
 * @param config - Optional ledger configuration
 * @returns Full party identifier (e.g., "Alice::1220abc...")
 * @throws Error if party is not found on the ledger
 *
 * @example
 * \\\`\\\`\\\`ts
 * // Resolve simple name to full identifier
 * const alice = await resolveParty('Alice');
 * // Returns: "Alice::1220cc28a614..."
 *
 * // Already a full identifier? Returns as-is
 * const bob = await resolveParty('Bob::1220abc...');
 * // Returns: "Bob::1220abc..."
 * \\\`\\\`\\\`
 */
export async function resolveParty(partyName: string, config?: Partial<LedgerConfig>): Promise<Party> {
  // If already a full identifier (contains ::), return as-is
  if (partyName.includes('::')) {
    return partyName as Party;
  }

  // Query all parties from the ledger
  const allParties = await getParties(config);

  // Find party that starts with the name
  const match = allParties.find(p => p.startsWith(\\\`\\\${partyName}::\\\`));
  if (!match) {
    throw new Error(
      \\\`Party '\\\${partyName}' not found on ledger. \\\` +
      \\\`Available parties: \\\${allParties.join(', ')}\\\`
    );
  }

  return match;
}
`;

    const outputPath = path.join(this.outputDir, 'ledger', 'client.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/client.ts`);
  }

  private generateLedgerErrors(): void {
    const output = `// ledger/errors.ts
// Typed error classes for ledger operations
// DO NOT EDIT - Generated by generate-canton-api.ts

export enum LedgerErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  EXERCISE_FAILED = 'EXERCISE_FAILED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code: LedgerErrorCode,
    public readonly details?: unknown,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'LedgerError';
  }

  /** Convert ledger error to user-friendly message */
  toUserFriendlyMessage(): string {
    switch (this.code) {
      case LedgerErrorCode.CONNECTION_FAILED:
        return 'Unable to connect to ledger. Check connection settings.';
      case LedgerErrorCode.TIMEOUT:
        return 'Request timed out. Ledger may be slow or unavailable.';
      case LedgerErrorCode.UNAUTHORIZED:
        return 'Authentication failed. Check token or permissions.';
      case LedgerErrorCode.CONTRACT_NOT_FOUND:
        return \`Contract not found. It may have been archived or you lack visibility.\`;
      case LedgerErrorCode.EXERCISE_FAILED:
        return this.parseExerciseError() || 'Failed to execute choice. Check arguments and permissions.';
      case LedgerErrorCode.INVALID_ARGUMENT:
        return 'Invalid arguments provided. Check types and required fields.';
      case LedgerErrorCode.NETWORK_ERROR:
        return 'Network error. Check connectivity.';
      default:
        return this.message;
    }
  }

  /** Parse Canton exercise error for meaningful context */
  private parseExerciseError(): string | null {
    const msg = this.message.toLowerCase();
    if (msg.includes('authorization')) return 'Insufficient authorization. Missing signatory or controller.';
    if (msg.includes('contract not active')) return 'Contract is archived or locked.';
    if (msg.includes('missing field')) return 'Required field missing in arguments.';
    if (msg.includes('type mismatch')) return 'Argument type mismatch. Check value types.';
    if (msg.includes('precondition failed')) return 'Choice precondition not met. Check contract state.';
    return null;
  }
}

export class ConnectionError extends LedgerError {
  constructor(message: string, details?: unknown) {
    super(message, LedgerErrorCode.CONNECTION_FAILED, details);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends LedgerError {
  constructor(message: string = 'Request timed out', details?: unknown) {
    super(message, LedgerErrorCode.TIMEOUT, details);
    this.name = 'TimeoutError';
  }
}

export class UnauthorizedError extends LedgerError {
  constructor(message: string = 'Unauthorized', details?: unknown) {
    super(message, LedgerErrorCode.UNAUTHORIZED, details);
    this.name = 'UnauthorizedError';
  }
}

export class ContractNotFoundError extends LedgerError {
  constructor(contractId: string) {
    super(\`Contract not found: \${contractId}\`, LedgerErrorCode.CONTRACT_NOT_FOUND, { contractId });
    this.name = 'ContractNotFoundError';
  }
}

export class ExerciseError extends LedgerError {
  constructor(message: string, details?: unknown) {
    super(message, LedgerErrorCode.EXERCISE_FAILED, details);
    this.name = 'ExerciseError';
  }
}

export function isLedgerError(error: unknown): error is LedgerError {
  return error instanceof LedgerError;
}

export function isRetryable(error: unknown): boolean {
  if (!isLedgerError(error)) return false;
  return [
    LedgerErrorCode.CONNECTION_FAILED,
    LedgerErrorCode.TIMEOUT,
    LedgerErrorCode.NETWORK_ERROR,
  ].includes(error.code);
}
`;
    const outputPath = path.join(this.outputDir, 'ledger', 'errors.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/errors.ts`);
  }

  private generateLedgerRetry(): void {
    const output = `// ledger/retry.ts
// Retry and backoff utilities for ledger operations
// DO NOT EDIT - Generated by generate-canton-api.ts

import { isRetryable, LedgerError } from './errors';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, options: RetryOptions): number {
  const delay = options.baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.1 * delay;
  return Math.min(delay + jitter, options.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry = opts.retryOn
        ? opts.retryOn(lastError)
        : isRetryable(lastError);

      if (!shouldRetry || attempt === opts.maxAttempts) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function createRetryableClient<T extends object>(
  client: T,
  options: Partial<RetryOptions> = {}
): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (typeof value === 'function') {
        return (...args: unknown[]) => withRetry(() => value.apply(target, args), options);
      }
      return value;
    },
  });
}
`;
    const outputPath = path.join(this.outputDir, 'ledger', 'retry.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/retry.ts`);
  }

  private generateLedgerStreaming(): void {
    const output = `// ledger/streaming.ts
// SSE streaming client for Canton JSON API
// DO NOT EDIT - Generated by generate-canton-api.ts

export interface ContractEvent {
  type: 'created' | 'archived';
  contractId: string;
  templateId: string;
  payload?: unknown;
  offset?: string;
}

export interface StreamOptions {
  templateIds: string[];
  filter?: Record<string, unknown>;
  onContract: (event: ContractEvent) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
}

export class LedgerStream {
  private eventSource: EventSource | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(baseUrl: string, token: string | undefined, party: string, options: StreamOptions): void {
    if (this.eventSource) {
      this.disconnect();
    }

    const params = new URLSearchParams({
      templateIds: options.templateIds.join(','),
    });
    if (options.filter) {
      params.set('query', JSON.stringify(options.filter));
    }

    const url = \`\${baseUrl}/v1/stream/query?\${params.toString()}\`;

    this.eventSource = new EventSource(url, {
      withCredentials: !!token,
    });

    this.eventSource.onopen = () => {
      this._isConnected = true;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.events) {
          for (const e of data.events) {
            if (e.created) {
              options.onContract({
                type: 'created',
                contractId: e.created.contractId,
                templateId: e.created.templateId,
                payload: e.created.payload,
                offset: data.offset,
              });
            } else if (e.archived) {
              options.onContract({
                type: 'archived',
                contractId: e.archived.contractId,
                templateId: e.archived.templateId,
                offset: data.offset,
              });
            }
          }
        }
      } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    this.eventSource.onerror = (err) => {
      this._isConnected = false;
      options.onError?.(new Error('Stream connection error'));
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this._isConnected = false;
    }
  }
}

export function createContractStream(): LedgerStream {
  return new LedgerStream();
}
`;
    const outputPath = path.join(this.outputDir, 'ledger', 'streaming.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/streaming.ts`);
  }

  private generateLedgerResolver(): void {
    const output = `// ledger/resolver.ts
// Runtime package hash resolution for Canton template IDs
// DO NOT EDIT - Generated by generate-canton-api.ts

/**
 * PackageResolver handles runtime resolution of template IDs from package names to package hashes.
 * 
 * Canton JSON API requires template IDs in the format:
 *   \\\`<64-char-package-hash>:<Module.Path>:<TemplateName>\\\`
 * 
 * But the generated SDK uses package names for readability:
 *   \\\`<package-name>:<Module.Path>:<TemplateName>\\\`
 * 
 * This class resolves package names to their hashes at runtime by:
 * 1. Fetching all package hashes from /v1/packages
 * 2. Testing each hash against known templates via /v1/query
 * 3. Caching successful mappings for the session
 * 
 * @example
 * const resolver = new PackageResolver();
 * await resolver.initialize(ledgerUrl, headers);
 * const resolvedId = await resolver.resolveTemplateId(
 *   'myapp:MyApp.Config:AppConfig',
 *   ledgerUrl,
 *   headers
 * );
 * // Returns: '1af92803cb886bb01871a1049c808199feb933b4eebd2253585af52a386e1f32:MyApp.Config:AppConfig'
 */
export class PackageResolver {
  /** Cache mapping package names to their hashes */
  private packageCache = new Map<string, string>();
  
  /** All available package hashes from the ledger */
  private packageHashes: string[] = [];
  
  /** Whether the resolver has been initialized */
  private initialized = false;
  
  /** Pending initialization promise to prevent duplicate init calls */
  private initPromise: Promise<void> | null = null;

  /**
   * Check if a template ID is already a resolved hash (64-char hex).
   */
  private isResolvedHash(packagePart: string): boolean {
    return /^[a-f0-9]{64}$/i.test(packagePart);
  }

  /**
   * Initialize the resolver by fetching all package hashes from the ledger.
   * Safe to call multiple times - only fetches once.
   */
  async initialize(baseUrl: string, headers: Record<string, string>): Promise<void> {
    if (this.initialized) return;
    
    // Prevent duplicate initialization
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this.doInitialize(baseUrl, headers);
    return this.initPromise;
  }
  
  private async doInitialize(baseUrl: string, headers: Record<string, string>): Promise<void> {
    try {
      const response = await fetch(\`\${baseUrl}/v1/packages\`, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) {
        console.warn(\`PackageResolver: Failed to fetch packages: \${response.status}\`);
        return;
      }
      
      const data = await response.json() as { result?: string[] };
      this.packageHashes = data.result || [];
      this.initialized = true;
      
      console.log(\`PackageResolver: Loaded \${this.packageHashes.length} package hashes\`);
    } catch (error) {
      console.warn(\`PackageResolver: Initialization failed:\`, error);
    }
  }

  /**
   * Resolve a template ID from package name format to package hash format.
   * 
   * @param templateId - Template ID in format "packageName:Module.Path:TemplateName"
   * @param baseUrl - Ledger base URL
   * @param headers - Request headers (including auth)
   * @returns Resolved template ID with package hash
   * @throws Error if package cannot be resolved
   */
  async resolveTemplateId(
    templateId: string,
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<string> {
    // Parse the template ID
    const parts = templateId.split(':');
    if (parts.length !== 3) {
      throw new Error(\`Invalid template ID format: \${templateId}. Expected "package:Module.Path:TemplateName"\`);
    }
    
    const [packageName, modulePath, templateName] = parts;
    
    // If already a hash, return as-is
    if (this.isResolvedHash(packageName)) {
      return templateId;
    }
    
    // Check cache first
    const cachedHash = this.packageCache.get(packageName);
    if (cachedHash) {
      return \`\${cachedHash}:\${modulePath}:\${templateName}\`;
    }
    
    // Ensure we have package hashes
    if (!this.initialized) {
      await this.initialize(baseUrl, headers);
    }
    
    if (this.packageHashes.length === 0) {
      throw new Error(\`PackageResolver: No packages available. Is the ledger running?\`);
    }
    
    // Try each hash until we find one that works for this template
    for (const hash of this.packageHashes) {
      const testId = \`\${hash}:\${modulePath}:\${templateName}\`;
      
      try {
        const response = await fetch(\`\${baseUrl}/v1/query\`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            templateIds: [testId],
            query: {},
          }),
        });
        
        // Canton JSON API may return HTTP 200 even when the body contains errors.
        // Only treat it as success if the response body has no errors.
        if (response.ok) {
          const data = await response.json().catch(() => null) as
            | { errors?: unknown; result?: unknown }
            | null;

          const errorsValue = data && typeof data === 'object' ? (data as { errors?: unknown }).errors : undefined;
          const hasErrors =
            Array.isArray(errorsValue) ? errorsValue.length > 0 : !!errorsValue;

          if (hasErrors) {
            // Wrong package hash for this template, try next
            continue;
          }

          // Success - cache mapping for future use
          this.packageCache.set(packageName, hash);
          console.log(\`PackageResolver: Resolved "\${packageName}" -> "\${hash.substring(0, 8)}..."\`);
          return testId;
        }
        
        // 400 with unknownTemplateIds means wrong package, try next
        // Other errors might be transient, continue trying
      } catch {
        // Network error, continue to next hash
      }
    }
    
    throw new Error(
      \`PackageResolver: Could not resolve package "\${packageName}" for template "\${modulePath}:\${templateName}". \` +
      \`Tried \${this.packageHashes.length} packages. Ensure the DAR is deployed to the ledger.\`
    );
  }

  /**
   * Resolve multiple template IDs in batch.
   * More efficient than resolving one at a time as it reuses cached mappings.
   */
  async resolveTemplateIds(
    templateIds: string[],
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<string[]> {
    return Promise.all(
      templateIds.map(id => this.resolveTemplateId(id, baseUrl, headers))
    );
  }

  /**
   * Clear the package cache. Useful if packages have been updated on the ledger.
   */
  clearCache(): void {
    this.packageCache.clear();
    this.packageHashes = [];
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Get the current cache state for debugging.
   */
  getCacheState(): { initialized: boolean; packageCount: number; cachedMappings: number } {
    return {
      initialized: this.initialized,
      packageCount: this.packageHashes.length,
      cachedMappings: this.packageCache.size,
    };
  }
}

/** Singleton resolver instance for convenience */
let globalResolver: PackageResolver | null = null;

/**
 * Get the global PackageResolver instance.
 * Creates one if it doesn't exist.
 */
export function getPackageResolver(): PackageResolver {
  if (!globalResolver) {
    globalResolver = new PackageResolver();
  }
  return globalResolver;
}

/**
 * Create a new PackageResolver instance.
 * Use this if you need isolated resolution (e.g., multiple ledgers).
 */
export function createPackageResolver(): PackageResolver {
  return new PackageResolver();
}
`;
    const outputPath = path.join(this.outputDir, 'ledger', 'resolver.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/resolver.ts`);
  }

  private generateUtils(): void {
    const utilsDir = path.join(this.outputDir, 'utils');
    fs.mkdirSync(utilsDir, { recursive: true });

    this.generateUtilsAmounts();
    this.generateUtilsIds();
    this.generateUtilsDatetime();
    this.generateUtilsDamlMap();
    this.generateUtilsIndex();
  }

  private generateUtilsAmounts(): void {
    const output = `// utils/amounts.ts
// Amount utilities for financial calculations
// DO NOT EDIT - Generated by generate-canton-api.ts

import type { Numeric } from '../core/primitives';

export function normalizeAmount(value: string | number): Numeric {
  if (typeof value === 'number') {
    return value.toString();
  }
  return value.replace(/,/g, '');
}

export function formatAmount(value: Numeric, decimals: number = 2): string {
  const num = parseFloat(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function addAmounts(a: Numeric, b: Numeric): Numeric {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  return (numA + numB).toString();
}

export function subtractAmounts(a: Numeric, b: Numeric): Numeric {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  return (numA - numB).toString();
}

export function isValidAmount(value: string): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && isFinite(num);
}

export function compareAmounts(a: Numeric, b: Numeric): number {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  return numA - numB;
}
`;
    const outputPath = path.join(this.outputDir, 'utils', 'amounts.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ utils/amounts.ts`);
  }

  private generateUtilsIds(): void {
    const output = `// utils/ids.ts
// ID and key creation utilities
// DO NOT EDIT - Generated by generate-canton-api.ts

import type { Party } from '../core/primitives';
import type { Id, AccountKey, InstrumentKey, HoldingFactoryKey } from '../core/interfaces';

export function createId(value: string): Id {
  return { unpack: value };
}

export function createAccountKey(custodian: Party, owner: Party, id: string): AccountKey {
  return { custodian, owner, id: createId(id) };
}

export function createInstrumentKey(
  depository: Party,
  issuer: Party,
  id: string,
  version: string = '1'
): InstrumentKey {
  return {
    depository,
    issuer,
    id: createId(id),
    version,
    holdingStandard: 'TransferableFungible',
  };
}

export function createHoldingFactoryKey(provider: Party, id: string): HoldingFactoryKey {
  return { provider, id: createId(id) };
}

export function idToString(id: Id): string {
  return id.unpack;
}

export function generateUniqueId(prefix: string = 'id'): string {
  return \`\${prefix}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
}
`;
    const outputPath = path.join(this.outputDir, 'utils', 'ids.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ utils/ids.ts`);
  }

  private generateUtilsDatetime(): void {
    const output = `// utils/datetime.ts
// Date and time utilities for Canton
// DO NOT EDIT - Generated by generate-canton-api.ts

import type { Time } from '../core/primitives';

export function toCantonTime(date: Date): Time {
  return date.toISOString();
}

export function fromCantonTime(time: Time): Date {
  return new Date(time);
}

export function formatDate(time: Time, options?: Intl.DateTimeFormatOptions): string {
  const date = fromCantonTime(time);
  return date.toLocaleDateString(undefined, options);
}

export function formatDateTime(time: Time): string {
  const date = fromCantonTime(time);
  return date.toLocaleString();
}

export function nowAsCantonTime(): Time {
  return toCantonTime(new Date());
}
`;
    const outputPath = path.join(this.outputDir, 'utils', 'datetime.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ utils/datetime.ts`);
  }

  private generateUtilsDamlMap(): void {
    const output = `// utils/damlMap.ts
// Helpers for working with DamlMap<K, V> (array-of-pairs)
// DO NOT EDIT - Generated by generate-canton-api.ts

import type { DamlMap } from '../core/primitives';

/**
 * Convert a Record<string, V> to a DamlMap<string, V>.
 * NOTE: Duplicates are not possible in a Record.
 */
export function damlMapFromRecord<V>(record: Record<string, V>): DamlMap<string, V> {
  return Object.entries(record) as DamlMap<string, V>;
}

/**
 * Convert a DamlMap<string, V> to a Record<string, V>.
 * NOTE: If the DamlMap contains duplicate keys, the last value wins.
 */
export function damlMapToRecord<V>(map: DamlMap<string, V>): Record<string, V> {
  return Object.fromEntries(map) as Record<string, V>;
}

/** Get a value from a DamlMap using strict equality on keys. */
export function damlMapGet<K, V>(map: DamlMap<K, V>, key: K): V | undefined {
  for (const [k, v] of map) {
    if (k === key) return v;
  }
  return undefined;
}

/** Set a value in a DamlMap (returns a new map). */
export function damlMapSet<K, V>(map: DamlMap<K, V>, key: K, value: V): DamlMap<K, V> {
  const out: Array<[K, V]> = [];
  let replaced = false;
  for (const [k, v] of map) {
    if (k === key) {
      out.push([key, value]);
      replaced = true;
    } else {
      out.push([k, v]);
    }
  }
  if (!replaced) out.push([key, value]);
  return out as DamlMap<K, V>;
}

/** Delete a key from a DamlMap (returns a new map). */
export function damlMapDelete<K, V>(map: DamlMap<K, V>, key: K): DamlMap<K, V> {
  return map.filter(([k]) => k !== key) as DamlMap<K, V>;
}
`;
    const outputPath = path.join(this.outputDir, 'utils', 'damlMap.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ utils/damlMap.ts`);
  }

  private generateUtilsIndex(): void {
    const output = `// utils/index.ts
// Re-exports all utilities
// DO NOT EDIT - Generated by generate-canton-api.ts

export * from './amounts';
export * from './ids';
export * from './datetime';
export * from './damlMap';
`;
    const outputPath = path.join(this.outputDir, 'utils', 'index.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ utils/index.ts`);
  }

  private generateLedgerIndex(): void {
    const output = `// ledger/index.ts
// Re-exports all ledger utilities
// DO NOT EDIT - Generated by generate-canton-api.ts

export { createConfig, createConfigFromEnv, createJwtToken } from './config';
export type { LedgerConfig, JwtOptions } from './config';

export {
  CantonLedgerClient,
  createLedgerClient,
  isLedgerReachable,
  getParties,
  resolveParty,
  uniqueId,
} from './client';

export {
  LedgerError,
  LedgerErrorCode,
  ConnectionError,
  TimeoutError,
  UnauthorizedError,
  ContractNotFoundError,
  ExerciseError,
  isLedgerError,
  isRetryable,
} from './errors';

export { withRetry, createRetryableClient } from './retry';
export type { RetryOptions } from './retry';

export { LedgerStream, createContractStream } from './streaming';
export type { ContractEvent, StreamOptions } from './streaming';

export {
  PackageResolver,
  getPackageResolver,
  createPackageResolver,
} from './resolver';
`;

    const outputPath = path.join(this.outputDir, 'ledger', 'index.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ledger/index.ts`);
  }

  private generateProjectApi(): void {
    const output = this.buildProjectApi();
    const outputPath = path.join(this.outputDir, `${this.projectName}-api.ts`);
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ ${this.projectName}-api.ts`);
  }

  private buildProjectApi(): string {
    let output = `// ${this.projectName}-api.ts
// ${this.projectName.charAt(0).toUpperCase() + this.projectName.slice(1)} Project API
// DO NOT EDIT - Generated by generate-canton-api.ts
//
// This file contains all workflows and operations available in the ${this.projectName} project.
// Import this file to interact with the Canton ledger.

import {
  Party, ContractId, Optional, Numeric, Time, Command, Contract, ExerciseResult, DamlMap
} from './core/primitives';
import {
  AccountKey, InstrumentKey, HoldingFactoryKey, Quantity, Id, Controllers,
  Lock, RoutedStep, HoldingStandard, Allocation, Approval
} from './core/interfaces';

// ═══════════════════════════════════════════════════════════════
// TEMPLATE IDS
// ═══════════════════════════════════════════════════════════════

export const TemplateIds = {
`;

    for (const template of this.templates) {
      output += `  ${template.qualifiedName}: '${template.templateId}',\n`;
    }
    output += `} as const;\n\n`;

    output += `// ═══════════════════════════════════════════════════════════════
// TEMPLATE NAMESPACES
// ═══════════════════════════════════════════════════════════════
// Each template gets a namespace with:
// - Payload interface (the template fields)
// - create() function to create the contract
// - One function per choice (except Archive)
// ═══════════════════════════════════════════════════════════════

`;

    // Generate namespace for ALL templates
    for (const template of this.templates) {
      output += this.generateTemplateNamespace(template);
    }

    output += this.generateQueryNamespace();
    output += this.generateTypeGuardsNamespace();

    // Add helper types
    output += `
// ═══════════════════════════════════════════════════════════════
// HOLDING TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Base holding representing asset ownership.
 */
export interface Holding {
  instrument: InstrumentKey;
  account: AccountKey;
  amount: Numeric;
  lock: Optional<Lock>;
  observers: DamlMap<string, Party[]>;
}

/**
 * Fungible holding - can be merged and split.
 */
export interface Fungible extends Holding {}

/**
 * Transferable holding - can change ownership.
 */
export interface Transferable extends Holding {}

/**
 * Holding that is both fungible and transferable.
 * Most common type for liquid financial assets.
 */
export interface TransferableFungible extends Holding {}

// ═══════════════════════════════════════════════════════════════
// SETTLEMENT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Settlement batch grouping multiple instructions.
 */
export interface Batch {
  instructor: Party;
  consenters: Party[];
  settlers: Party[];
  id: Id;
  description: string;
  contextId: Optional<Id>;
  routedStepsWithInstructionId: Array<{ step: RoutedStep; instructionId: Id }>;
  settlementTime: Optional<Time>;
}

/**
 * Single settlement instruction.
 */
export interface Instruction {
  instructor: Party;
  consenters: Party[];
  settlers: Party[];
  batchId: Id;
  id: Id;
  routedStep: RoutedStep;
  settlementTime: Optional<Time>;
  allocation: Allocation;
  approval: Approval;
  signedSenders: Party[];
  signedReceivers: Party[];
  observers: DamlMap<string, Party[]>;
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Account for holding assets.
 */
export interface Account {
  custodian: Party;
  owner: Party;
  lock: Optional<Lock>;
  controllers: Controllers;
  id: Id;
  description: string;
  holdingFactory: HoldingFactoryKey;
  observers: DamlMap<string, Party[]>;
}

// ═══════════════════════════════════════════════════════════════
// INSTRUMENT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Financial instrument definition.
 */
export interface Instrument {
  depository: Party;
  issuer: Party;
  id: Id;
  version: string;
  holdingStandard: HoldingStandard;
  description: string;
  validAsOf: Time;
  observers: DamlMap<string, Party[]>;
}

/**
 * Token data for creating token instruments via factory.
 */
export interface TokenData {
  instrument: InstrumentKey;
  description: string;
  validAsOf: Time;
}

// ═══════════════════════════════════════════════════════════════
// VIEW TYPES (for Reference templates)
// ═══════════════════════════════════════════════════════════════

/**
 * Account view for reference templates.
 */
export interface AccountView {
  custodian: Party;
  owner: Party;
  id: Id;
}

/**
 * Holding factory view for reference templates.
 */
export interface HoldingFactoryView {
  provider: Party;
  id: Id;
}

// ═══════════════════════════════════════════════════════════════
// MOCK FACTORIES (for testing)
// ═══════════════════════════════════════════════════════════════

/**
 * Factory functions for creating mock data in tests.
 * Use these to quickly generate valid test data.
 */
export const MockFactories = {
  /**
   * Generate a mock party identifier
   * @example MockFactories.party('alice') // 'alice::1220abc123'
   */
  party: (name: string = 'test'): Party => {
    const randomHex = () => Math.random().toString(16).substring(2, 10);
    return \`\${name}::1220\${randomHex()}\` as Party;
  },

  /**
   * Generate a mock ID
   * @example MockFactories.id('account') // { unpack: 'account-1234567890' }
   */
  id: (prefix: string = 'id'): Id => ({
    unpack: \`\${prefix}-\${Date.now()}\`
  }),

  /**
   * Generate a mock AccountKey
   * @example MockFactories.accountKey(custodian, owner, 'acc-1')
   */
  accountKey: (custodian: Party, owner: Party, id?: string): AccountKey => ({
    custodian,
    owner,
    id: id ? { unpack: id } : MockFactories.id('account')
  }),

  /**
   * Generate a mock InstrumentKey
   * @example MockFactories.instrumentKey(depository, issuer, 'USD')
   */
  instrumentKey: (
    depository: Party,
    issuer: Party,
    id: string = 'USD',
    version: string = '1'
  ): InstrumentKey => ({
    depository,
    issuer,
    id: { unpack: id },
    version,
    holdingStandard: 'TransferableFungible'
  }),

  /**
   * Generate a mock HoldingFactoryKey
   * @example MockFactories.holdingFactoryKey(provider, 'factory-1')
   */
  holdingFactoryKey: (provider: Party, id?: string): HoldingFactoryKey => ({
    provider,
    id: id ? { unpack: id } : MockFactories.id('factory')
  }),

  /**
   * Generate a mock Quantity
   * @example MockFactories.quantity(instrumentKey, '1000.0')
   */
  quantity: (instrument: InstrumentKey, amount: string = '100.0'): Quantity => ({
    unit: instrument,
    amount: amount as Numeric
  }),

  /**
   * Generate a mock Controllers
   * @example MockFactories.controllers(owner, custodian)
   */
  controllers: (outgoing: Party[], incoming: Party[]): Controllers => ({
    outgoing,
    incoming
  })
};
`;

    return output;
  }

  /**
   * Generate a unified namespace for any template.
   * All templates get the same structure: Payload interface + create() + choice functions.
   */
  private generateTemplateNamespace(template: TemplateIR): string {
    const namespaceName = template.qualifiedName;
    const templateIdKey = template.qualifiedName;

    // Build example for documentation
    const exampleFields = template.fields.slice(0, 3).map(f => {
      if (f.type.includes('Party')) return `${f.name}: 'alice::1220...'`;
      if (f.type.includes('Id')) return `${f.name}: { unpack: 'id-1' }`;
      if (f.type.includes('string')) return `${f.name}: 'example'`;
      if (f.type.includes('Numeric')) return `${f.name}: '100.0'`;
      return `${f.name}: {...}`;
    }).join(', ');

    // Filter out Archive choice
    const meaningfulChoices = template.choices.filter(c => c.name !== 'Archive');

    let output = `/**
 * ${namespaceName}
 * Role: ${template.role}
 * Template ID: ${template.templateId}
 * Choices: ${meaningfulChoices.length > 0 ? meaningfulChoices.map(c => c.name).join(', ') : 'none'}
 *
 * @example
 * const cmd = ${namespaceName}.create({ ${exampleFields} });
 * const contractId = await ledger.create(cmd.templateId, cmd.argument);
 */
export namespace ${namespaceName} {

  /** Template payload fields */
  export interface Payload {
`;

    for (const field of template.fields) {
      output += `    ${field.name}: ${field.type};\n`;
    }
    output += `  }\n\n`;

    // Create function - always the same
    output += `  /** Create a new ${template.name} contract */
  export function create(payload: Payload): Command<Payload> {
    return {
      templateId: TemplateIds.${templateIdKey},
      argument: payload
    };
  }\n`;

    // Generate a function for each choice (except Archive)
    for (const choice of meaningfulChoices) {
      const fnName = this.toChoiceFunctionName(choice.name);
      const hasArgs = !isEmptyChoiceArgsType(choice.argsType);
      const hasParsedArgs = choice.params && choice.params.length > 0;
      const returnType = sanitizeReturnType(choice.returnType);

      if (hasArgs) {
        output += `
  /** Exercise ${choice.name} choice */
  export function ${fnName}(
    contractId: ContractId<Payload>,
    args: ${hasParsedArgs
      ? `{\n${choice.params.map(p => `      ${p.name}: ${p.type};`).join('\n')}\n    }`
      : `Record<string, unknown> /* Unparsed args type: ${choice.argsType} */`}
  ): Command<${returnType}> {
    return {
      templateId: TemplateIds.${templateIdKey},
      choice: '${choice.name}',
      contractId: contractId as string,
      argument: args
    };
  }\n`;
      } else {
        output += `
  /** Exercise ${choice.name} choice */
  export function ${fnName}(contractId: ContractId<Payload>): Command<${returnType}> {
    return {
      templateId: TemplateIds.${templateIdKey},
      choice: '${choice.name}',
      contractId: contractId as string,
      argument: {}
    };
  }\n`;
      }
    }

    output += `}\n\n`;
    return output;
  }

  /**
   * Convert choice name to a valid function name.
   * E.g., "Accept" -> "accept", "ProcessDeposit" -> "processDeposit"
   */
  private toChoiceFunctionName(choiceName: string): string {
    return choiceName.charAt(0).toLowerCase() + choiceName.slice(1);
  }

  private generatePackageJson(): void {
    const packageJson = {
      name: `${this.projectName}-sdk`,
      version: '0.1.0',
      type: 'module',
      main: `./${this.projectName}-api.ts`,
      types: `./${this.projectName}-api.ts`,
      exports: {
        '.': `./${this.projectName}-api.ts`,
        './core': './core/index.ts',
        './ledger': './ledger/index.ts',
        './utils': './utils/index.ts',
        './react': './react/index.ts',
      },
      peerDependencies: {
        'react': '^18.0.0 || ^19.0.0',
        '@tanstack/react-query': '^5.0.0',
      },
      peerDependenciesMeta: {
        'react': { optional: true },
        '@tanstack/react-query': { optional: true },
      },
    };

    const outputPath = path.join(this.outputDir, 'package.json');
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`   ✓ package.json`);
    } else {
      console.log(`   ⏭ package.json (already exists)`);
    }
  }

  private generateTsConfig(): void {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
        outDir: './dist',
        resolveJsonModule: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        jsx: 'react-jsx',
      },
      include: [
        '*.ts',
        'core/**/*.ts',
        'ledger/**/*.ts',
        'utils/**/*.ts',
        'react/**/*.ts',
        'react/**/*.tsx',
      ],
      exclude: ['node_modules', 'dist'],
    };

    const outputPath = path.join(this.outputDir, 'tsconfig.json');
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, JSON.stringify(tsconfig, null, 2) + '\n');
      console.log(`   ✓ tsconfig.json`);
    } else {
      console.log(`   ⏭ tsconfig.json (already exists)`);
    }
  }

  private generateQueryNamespace(): string {
    let output = `// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════
// Typed query helpers for each template

export namespace Query {
  export interface QuerySpec<T> {
    templateId: string;
    filter: Partial<T>;
  }

`;

    // Generate a query function for ALL templates
    for (const template of this.templates) {
      const queryName = this.toCamelCase(template.qualifiedName);
      output += `  /** Query ${template.qualifiedName} contracts */
  export function ${queryName}(filter?: Partial<${template.qualifiedName}.Payload>): QuerySpec<${template.qualifiedName}.Payload> {
    return {
      templateId: TemplateIds.${template.qualifiedName},
      filter: filter || {}
    };
  }

`;
    }

    output += `}\n\n`;
    return output;
  }

  private generateTypeGuardsNamespace(): string {
    let output = `// ═══════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════
// Runtime type checking for template payloads

export namespace TypeGuards {
`;

    // Generate type guards for ALL templates
    for (const template of this.templates) {
      const guardName = `is${template.qualifiedName.replace(/_/g, '')}`;
      const requiredFields = template.fields.filter(f => !f.type.includes('Optional')).slice(0, 3);

      if (requiredFields.length > 0) {
        output += `  /** Type guard for ${template.qualifiedName}.Payload */
  export function ${guardName}(obj: unknown): obj is ${template.qualifiedName}.Payload {
    if (!obj || typeof obj !== 'object') return false;
    const record = obj as Record<string, unknown>;
    return ${requiredFields.map(f => `'${f.name}' in record`).join(' && ')};
  }

`;
      }
    }

    output += `}\n\n`;
    return output;
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private generateReadme(): void {
    // Find first template with choices for example
    const exampleTemplate = this.templates.find(t =>
      t.choices.filter(c => c.name !== 'Archive').length > 0
    ) || this.templates[0];

    const output = `# ${this.projectName.charAt(0).toUpperCase() + this.projectName.slice(1)} SDK

Generated TypeScript SDK for ${this.projectName} Canton ledger.

## Installation

\`\`\`bash
npm install
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and configure ledger connection:

\`\`\`bash
LEDGER_HOST=localhost
LEDGER_PORT=7575
LEDGER_TOKEN=  # Optional JWT token
\`\`\`

## JSON API Auth (curl)

The Canton JSON API requires an OAuth2 Bearer token (JWT).
This SDK auto-generates an **unsigned dev token** for sandbox if you don't provide \`LEDGER_TOKEN\`.

If you want to test the JSON API manually with curl:

\`\`\`bash
export PARTY="Alice::1220..."  # use a real party id from /v1/parties

TOKEN="$(node -e '
  const party = process.env.PARTY;
  if (!party) throw new Error(\"PARTY env var required\");
  const header = { alg: \"none\", typ: \"JWT\" };
  const payload = {
    \"https://daml.com/ledger-api\": {
      ledgerId: \"sandbox\",
      actAs: [party],
      readAs: [party],
      applicationId: \"${this.projectName}-sdk\",
    },
    exp: Math.floor(Date.now() / 1000) + 86400,
    iat: Math.floor(Date.now() / 1000),
  };
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj), \"utf8\")
      .toString(\"base64\")
      .replace(/=/g, \"\")
      .replace(/\\+/g, \"-\")
      .replace(/\\//g, \"_\");
  process.stdout.write(b64(header) + \".\" + b64(payload) + \".\");
')"

# IMPORTANT:
# - keep the trailing dot (unsigned JWT)
# - keep the header in double quotes (avoid shell mangling)
curl -s -H \"Authorization: Bearer \${TOKEN}\" http://localhost:7575/v1/packages
\`\`\`

## Quick Start

### Creating Contracts

Every template has a namespace with \`create()\` and choice functions:

\`\`\`typescript
import { ${exampleTemplate?.qualifiedName || 'MyTemplate'}, TemplateIds } from './${this.projectName}-api';
import { createLedgerClient } from './ledger';

const ledger = createLedgerClient('alice::1220...', { host: 'localhost', port: 7575 });

// Create a contract
const cmd = ${exampleTemplate?.qualifiedName || 'MyTemplate'}.create({
  // ... payload fields
});
const contractId = await ledger.create(cmd.templateId, cmd.argument);
\`\`\`

### Exercising Choices

${exampleTemplate && exampleTemplate.choices.filter(c => c.name !== 'Archive').length > 0 ? `\`\`\`typescript
// Exercise a choice
const choiceCmd = ${exampleTemplate.qualifiedName}.${this.toChoiceFunctionName(exampleTemplate.choices.filter(c => c.name !== 'Archive')[0]?.name || 'accept')}(contractId);
await ledger.exercise(
  choiceCmd.templateId,
  contractId,
  choiceCmd.choice!,
  choiceCmd.argument
);
\`\`\`
` : ''}
### Querying Contracts

\`\`\`typescript
import { Query } from './${this.projectName}-api';

// Query with type-safe filters
const spec = Query.${this.toCamelCase(exampleTemplate?.qualifiedName || 'myTemplate')}({ /* filter */ });
const contracts = await ledger.query(spec.templateId, spec.filter);
\`\`\`

## React Hooks (Optional)

\`\`\`typescript
import { CantonProvider } from './${this.projectName}-api/react';

function App() {
  return (
    <CantonProvider config={{ ledgerUrl: 'http://localhost:7575' }} party="alice::1220...">
      <YourComponent />
    </CantonProvider>
  );
}
\`\`\`

## Utilities

\`\`\`typescript
import { normalizeAmount, formatAmount, addAmounts } from './utils';
import { createAccountKey, createInstrumentKey } from './utils';
import { toCantonTime, nowAsCantonTime } from './utils';
\`\`\`

## Error Handling

\`\`\`typescript
import { LedgerError, isLedgerError, withRetry } from './ledger';

try {
  await ledger.create(templateId, payload);
} catch (error) {
  if (isLedgerError(error)) {
    console.error(\`Ledger error [\${error.code}]: \${error.message}\`);
  }
}
\`\`\`
`;

    const outputPath = path.join(this.outputDir, 'README.md');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ README.md`);
  }

  private generateGitignore(): void {
    const output = `# Dependencies
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build outputs
dist/
*.js
*.d.ts
*.js.map

# Environment
.env
.env.local

# Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Keep example files
!.env.example
`;

    const outputPath = path.join(this.outputDir, '.gitignore');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ .gitignore`);
  }

}

// === MAIN ===

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node generate-canton-api.ts <daml-js-dir> <output-dir> [project-name]');
    console.error('Example: npx ts-node generate-canton-api.ts ../daml-js . myproject');
    process.exit(1);
  }

  const damlJsDir = path.resolve(args[0]);
  const outputDir = path.resolve(args[1]);
  const projectName = args[2] || 'project';

  if (!fs.existsSync(damlJsDir)) {
    console.error(`Error: daml-js directory not found: ${damlJsDir}`);
    process.exit(1);
  }

  const generator = new CantonApiGenerator(damlJsDir, outputDir, projectName);
  generator.generate();
}

if (require.main === module) {
  main();
}
