#!/usr/bin/env npx ts-node
/**
 * Canton React Hooks Generator
 *
 * Generates React Query hooks from the Canton API file.
 * Follows DX guidelines:
 *   - Action-first naming: useAcceptDeposit, not useDeposit_Accept
 *   - Grouped workflow actions: useDepositActions()
 *   - Single barrel export
 *   - Query keys for cache management
 *
 * Usage: npx ts-node generate-canton-react.ts <sdk-dir> <project-name>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface WorkflowInfo {
  name: string;
  typeName: string;
  templateIdKey: string;
  choices: string[];
}

/** Information about a template namespace for generating typed hooks */
interface TemplateInfo {
  /** The namespace name (e.g., "Vault_Config_VaultConfig") */
  namespaceName: string;
  /** The template ID key in TemplateIds object */
  templateIdKey: string;
  /** Whether it has a Payload interface */
  hasPayload: boolean;
}

class CantonReactGenerator {
  private sdkDir: string;
  private projectName: string;
  private workflows: WorkflowInfo[] = [];
  private templateIds: string[] = [];
  /** All templates with Payload interface for typed query hooks */
  private allTemplates: TemplateInfo[] = [];

  constructor(sdkDir: string, projectName: string) {
    this.sdkDir = sdkDir;
    this.projectName = projectName;
  }

  generate(): void {
    console.log(`\n📦 Canton React Hooks Generator`);
    console.log(`   SDK Dir: ${this.sdkDir}`);
    console.log(`   Project: ${this.projectName}\n`);

    this.parseApiFile();
    this.generateReactDir();

    console.log(`\n✅ React hooks generated!`);
    console.log(`   Files created:`);
    console.log(`   - react/context/LedgerContext.tsx`);
    console.log(`   - react/context/useLedger.ts`);
    console.log(`   - react/hooks/core.ts`);
    console.log(`   - react/hooks/queries.ts`);
    console.log(`   - react/hooks/mutations.ts`);
    console.log(`   - react/hooks/keys.ts`);
    console.log(`   - react/index.ts\n`);
  }

  private parseApiFile(): void {
    const apiFile = path.join(this.sdkDir, `${this.projectName}-api.ts`);
    if (!fs.existsSync(apiFile)) {
      console.error(`Error: API file not found: ${apiFile}`);
      process.exit(1);
    }

    const content = fs.readFileSync(apiFile, 'utf-8');
    const sourceFile = ts.createSourceFile(apiFile, content, ts.ScriptTarget.Latest, true);

    // Parse TemplateIds
    this.parseTemplateIds(sourceFile);

    // Parse all template namespaces (for typed query hooks)
    this.parseAllTemplates(sourceFile);

    // Parse workflows using AST (for mutation hooks)
    this.parseWorkflows(sourceFile);

    console.log(`   Found ${this.templateIds.length} template IDs`);
    console.log(`   Found ${this.allTemplates.length} templates with Payload`);
    console.log(`   Found ${this.workflows.length} workflows`);
  }

  private parseTemplateIds(sourceFile: ts.SourceFile): void {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === 'TemplateIds') {
            if (decl.initializer) {
              // Handle both direct object literal and "as const" assertion
              let objLiteral: ts.ObjectLiteralExpression | null = null;
              
              if (ts.isObjectLiteralExpression(decl.initializer)) {
                objLiteral = decl.initializer;
              } else if (ts.isAsExpression(decl.initializer) && ts.isObjectLiteralExpression(decl.initializer.expression)) {
                // Handle: { ... } as const
                objLiteral = decl.initializer.expression;
              }
              
              if (objLiteral) {
                for (const prop of objLiteral.properties) {
                  if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                    this.templateIds.push(prop.name.text);
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * Parse all template namespaces that have a Payload interface.
   * These are used to generate typed query hooks.
   */
  private parseAllTemplates(sourceFile: ts.SourceFile): void {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        const namespaceName = node.name.text;

        // Skip utility namespaces that aren't templates
        if (namespaceName === 'Query' || namespaceName === 'TypeGuards' || namespaceName === 'MockFactories') {
          return;
        }

        if (node.body && ts.isModuleBlock(node.body)) {
          let hasPayload = false;

          // Look for Payload interface
          for (const member of node.body.statements) {
            if (ts.isInterfaceDeclaration(member) && ts.isIdentifier(member.name)) {
              if (member.name.text === 'Payload') {
                hasPayload = true;
                break;
              }
            }
          }

          if (hasPayload) {
            // Find matching template ID key
            const templateIdKey = this.findTemplateIdKeyForNamespace(namespaceName);
            if (templateIdKey) {
              this.allTemplates.push({
                namespaceName,
                templateIdKey,
                hasPayload: true,
              });
            }
          }
        }
      }
    });
  }

  /**
   * Find the template ID key that matches a namespace name.
   */
  private findTemplateIdKeyForNamespace(namespaceName: string): string | null {
    // Direct match
    if (this.templateIds.includes(namespaceName)) {
      return namespaceName;
    }
    // Fallback: look for partial match
    for (const id of this.templateIds) {
      if (id === namespaceName || id.endsWith(`_${namespaceName}`)) {
        return id;
      }
    }
    return null;
  }

  private parseWorkflows(sourceFile: ts.SourceFile): void {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        const namespaceName = node.name.text;

        if (node.body && ts.isModuleBlock(node.body)) {
          let typeName: 'Request' | 'Proposal' | null = null;
          const choices: string[] = [];

          // Look for Request or Proposal interface
          for (const member of node.body.statements) {
            if (ts.isInterfaceDeclaration(member) && ts.isIdentifier(member.name)) {
              const interfaceName = member.name.text;
              if (interfaceName === 'Request' || interfaceName === 'Proposal') {
                typeName = interfaceName;
              }
            }

            // Extract function names (choices)
            if (ts.isFunctionDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
              const fnName = member.name.text;
              if (fnName !== 'request' && fnName !== 'propose') {
                choices.push(fnName);
              }
            }
          }

          if (typeName) {
            const templateIdKey = this.findTemplateIdKey(namespaceName, typeName);
            this.workflows.push({
              name: namespaceName,
              typeName,
              templateIdKey,
              choices
            });
          }
        }
      }
    });
  }

  private findTemplateIdKey(workflowName: string, typeName: string): string {
    for (const id of this.templateIds) {
      if (id.includes(workflowName) && id.includes(typeName)) {
        return id;
      }
    }
    return `Workflow_${workflowName}_${typeName}`;
  }

  private generateReactDir(): void {
    const reactDir = path.join(this.sdkDir, 'react');
    fs.mkdirSync(path.join(reactDir, 'context'), { recursive: true });
    fs.mkdirSync(path.join(reactDir, 'hooks'), { recursive: true });

    this.generateLedgerContext();
    this.generateUseLedger();
    this.generateCoreHooks();
    this.generateQueryHooks();
    this.generateMutationHooks();
    this.generateQueryKeys();
    this.generateReactIndex();
  }

  private generateLedgerContext(): void {
    const output = `// react/context/LedgerContext.tsx
// Ledger React context provider
// DO NOT EDIT - Generated by generate-canton-react.ts

import * as React from 'react';
import { createContext, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Party, LedgerConnection } from '../../core';
import { CantonLedgerClient } from '../../ledger';

export interface LedgerContextValue {
  ledger: LedgerConnection;
  party: Party;
}

export const LedgerContext = createContext<LedgerContextValue | null>(null);

export interface CantonProviderProps {
  config: {
    ledgerUrl: string;
    token?: string;
  };
  party: Party;
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function CantonProvider({
  config,
  party,
  children,
  queryClient: providedClient,
}: CantonProviderProps): React.ReactElement {
  const ledger = useMemo(
    () => new CantonLedgerClient(party, config.ledgerUrl, config.token),
    [party, config.ledgerUrl, config.token]
  );

  const queryClient = useMemo(
    () => providedClient ?? new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5000,
          retry: 2,
        },
      },
    }),
    [providedClient]
  );

  const contextValue = useMemo(() => ({ ledger, party }), [ledger, party]);

  return (
    <QueryClientProvider client={queryClient}>
      <LedgerContext.Provider value={contextValue}>
        {children}
      </LedgerContext.Provider>
    </QueryClientProvider>
  );
}
`;
    const outputPath = path.join(this.sdkDir, 'react', 'context', 'LedgerContext.tsx');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/context/LedgerContext.tsx`);
  }

  private generateUseLedger(): void {
    const output = `// react/context/useLedger.ts
// Hook to access ledger context
// DO NOT EDIT - Generated by generate-canton-react.ts

import { useContext } from 'react';
import { LedgerContext, LedgerContextValue } from './LedgerContext';

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger must be used within a CantonProvider');
  }
  return context;
}
`;
    const outputPath = path.join(this.sdkDir, 'react', 'context', 'useLedger.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/context/useLedger.ts`);
  }

  private generateCoreHooks(): void {
    const output = `// react/hooks/core.ts
// Core generic hooks for contract operations
// DO NOT EDIT - Generated by generate-canton-react.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult, QueryKey } from '@tanstack/react-query';
import { useLedger } from '../context/useLedger';
import type { Contract, ContractId, ExerciseResult } from '../../core';

export function useContractQuery<T>(
  templateId: string,
  filter?: Partial<T>,
  options?: { enabled?: boolean }
): UseQueryResult<Contract<T>[]> {
  const { ledger } = useLedger();

  return useQuery({
    queryKey: ['contracts', templateId, filter] as const,
    queryFn: () => ledger.query<T>(templateId, filter),
    enabled: options?.enabled ?? true,
  });
}

export function useContractMutation<T>(
  templateId: string,
  options?: {
    onSuccess?: (contractId: ContractId<T>) => void;
    invalidateQueries?: QueryKey[];
  }
): UseMutationResult<ContractId<T>, Error, T> {
  const { ledger } = useLedger();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: T) => ledger.create<T>(templateId, payload),
    onSuccess: (contractId: ContractId<T>) => {
      options?.onSuccess?.(contractId);
      options?.invalidateQueries?.forEach((key: QueryKey) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/** Mutation input for choice execution */
export interface ChoiceMutationInput<TArgs = Record<string, never>> {
  contractId: string;
  args?: TArgs;
}

export function useChoiceMutation<TArgs = Record<string, never>, TResult = unknown>(
  templateId: string,
  choice: string,
  options?: {
    onSuccess?: (result: ExerciseResult<TResult>) => void;
    invalidateQueries?: QueryKey[];
  }
): UseMutationResult<ExerciseResult<TResult>, Error, ChoiceMutationInput<TArgs>> {
  const { ledger } = useLedger();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChoiceMutationInput<TArgs>) =>
      ledger.exercise<unknown, TResult>(
        templateId,
        input.contractId as ContractId<unknown>,
        choice,
        input.args ?? {}
      ),
    onSuccess: (result: ExerciseResult<TResult>) => {
      options?.onSuccess?.(result);
      options?.invalidateQueries?.forEach((key: QueryKey) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/** Simplified mutation for choices without arguments */
export function useSimpleChoiceMutation<TResult = unknown>(
  templateId: string,
  choice: string,
  options?: {
    onSuccess?: (result: ExerciseResult<TResult>) => void;
    invalidateQueries?: QueryKey[];
  }
): UseMutationResult<ExerciseResult<TResult>, Error, string> {
  const { ledger } = useLedger();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contractId: string) =>
      ledger.exercise<unknown, TResult>(
        templateId,
        contractId as ContractId<unknown>,
        choice,
        {}
      ),
    onSuccess: (result: ExerciseResult<TResult>) => {
      options?.onSuccess?.(result);
      options?.invalidateQueries?.forEach((key: QueryKey) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}
`;
    const outputPath = path.join(this.sdkDir, 'react', 'hooks', 'core.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/hooks/core.ts`);
  }

  private generateQueryHooks(): void {
    let output = `// react/hooks/queries.ts
// Generated typed query hooks for ALL contract types
// DO NOT EDIT - Generated by generate-canton-react.ts

import { useContractQuery } from './core';
import type { UseQueryResult } from '@tanstack/react-query';
import { TemplateIds } from '../../${this.projectName}-api';
import type { Contract } from '../../core';
import type * as API from '../../${this.projectName}-api';

// ═══════════════════════════════════════════════════════════════
// TYPED QUERY HOOKS
// ═══════════════════════════════════════════════════════════════
// Each template gets a typed query hook for full TypeScript inference.
// No more manual casts needed!

`;

    // Generate a typed query hook for EACH template (not just workflows)
    for (const template of this.allTemplates) {
      const hookName = this.generateQueryHookName(template.namespaceName);
      const fullTypeName = `API.${template.namespaceName}.Payload`;

      output += `/**
 * Query ${template.namespaceName} contracts with full type safety.
 * @param filter - Optional filter for the query
 * @returns Typed query result with Contract<${template.namespaceName}.Payload>[]
 */
export function ${hookName}(
  filter?: Partial<${fullTypeName}>,
  options?: { enabled?: boolean }
): UseQueryResult<Contract<${fullTypeName}>[]> {
  return useContractQuery<${fullTypeName}>(TemplateIds.${template.templateIdKey}, filter, options);
}

`;
    }

    // Also keep the original workflow hooks for backwards compatibility
    output += `// ═══════════════════════════════════════════════════════════════
// WORKFLOW QUERY HOOKS (Legacy - kept for backwards compatibility)
// ═══════════════════════════════════════════════════════════════

`;

    for (const workflow of this.workflows) {
      const pluralName = this.pluralize(workflow.name);
      const typeName = workflow.typeName;
      const fullTypeName = `API.${workflow.name}.${typeName}`;

      // Check if we already generated a hook for this
      const existingHookName = this.generateQueryHookName(workflow.templateIdKey);
      
      output += `/** @deprecated Use ${existingHookName} instead */
export function use${pluralName}(filter?: Partial<${fullTypeName}>) {
  return useContractQuery<${fullTypeName}>(TemplateIds.${workflow.templateIdKey}, filter);
}

`;
    }

    const outputPath = path.join(this.sdkDir, 'react', 'hooks', 'queries.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/hooks/queries.ts`);
  }

  /**
   * Generate a readable hook name from a template namespace.
   * E.g., "Vault_Config_VaultConfig" -> "useVaultConfigs"
   * E.g., "Holding_TransferableFungible_TransferableFungible" -> "useTransferableFungibleHoldings"
   */
  private generateQueryHookName(namespaceName: string): string {
    // Split by underscore and take meaningful parts
    const parts = namespaceName.split('_');
    
    // For simple names like "VaultConfig", just pluralize
    if (parts.length === 1) {
      return `use${this.pluralize(parts[0])}`;
    }
    
    // For compound names, try to create a readable hook name
    // Take the last part as the main type, and include context if needed
    const lastPart = parts[parts.length - 1];
    
    // If last two parts are the same (e.g., TransferableFungible_TransferableFungible), deduplicate
    if (parts.length >= 2 && parts[parts.length - 2] === lastPart) {
      // Include parent context for clarity (e.g., Holding_TransferableFungible)
      const context = parts.length >= 3 ? parts[parts.length - 3] : '';
      if (context) {
        return `use${context}${this.pluralize(lastPart)}`;
      }
      return `use${this.pluralize(lastPart)}`;
    }
    
    // Otherwise use the full name converted to camelCase
    const camelName = parts.map((p, i) => i === 0 ? p : p).join('');
    return `use${this.pluralize(camelName)}`;
  }

  private generateMutationHooks(): void {
    let output = `// react/hooks/mutations.ts
// Generated mutation hooks (action-first naming)
// DO NOT EDIT - Generated by generate-canton-react.ts

import { useSimpleChoiceMutation } from './core';
import { useQueryClient } from '@tanstack/react-query';
import { TemplateIds } from '../../${this.projectName}-api';
import { queryKeys } from './keys';

`;

    for (const workflow of this.workflows) {
      for (const choice of workflow.choices) {
        const hookName = `use${this.capitalize(choice)}${workflow.name}`;
        const keyName = this.toCamelCase(workflow.name);
        output += `/** ${this.capitalize(choice)} a ${workflow.name} - pass contractId directly */
export function ${hookName}() {
  return useSimpleChoiceMutation(
    TemplateIds.${workflow.templateIdKey},
    '${this.capitalize(choice)}',
    { invalidateQueries: [queryKeys.${keyName}.all] }
  );
}

`;
      }
    }

    for (const workflow of this.workflows) {
      const actionsHookName = `use${workflow.name}Actions`;
      const keyName = this.toCamelCase(workflow.name);

      output += `/** Grouped actions for ${workflow.name} workflow */
export function ${actionsHookName}() {
`;

      for (const choice of workflow.choices) {
        output += `  const ${choice}Mutation = useSimpleChoiceMutation(
    TemplateIds.${workflow.templateIdKey},
    '${this.capitalize(choice)}',
    { invalidateQueries: [queryKeys.${keyName}.all] }
  );
`;
      }

      output += `
  return {
`;
      for (const choice of workflow.choices) {
        output += `    /** ${this.capitalize(choice)} - pass contractId directly */
    ${choice}: (contractId: string) => ${choice}Mutation.mutateAsync(contractId),
    is${this.toProgressiveTense(choice)}: ${choice}Mutation.isPending,
`;
      }
      output += `    error: ${workflow.choices.map(c => `${c}Mutation.error`).join(' || ') || 'null'},
  };
}

`;
    }

    const outputPath = path.join(this.sdkDir, 'react', 'hooks', 'mutations.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/hooks/mutations.ts`);
  }

  private generateQueryKeys(): void {
    let output = `// react/hooks/keys.ts
// Query key factories for cache management
// DO NOT EDIT - Generated by generate-canton-react.ts

import type { QueryKey } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════
// Use these keys for cache invalidation and prefetching.
// Each template has its own key factory.

`;

    output += `export const queryKeys = {\n`;

    // Generate keys for ALL templates
    const generatedKeys = new Set<string>();
    
    for (const template of this.allTemplates) {
      const keyName = this.toCamelCase(template.namespaceName);
      
      // Skip if we already generated this key
      if (generatedKeys.has(keyName)) continue;
      generatedKeys.add(keyName);
      
      output += `  /** Query keys for ${template.namespaceName} */
  ${keyName}: {
    all: ['${keyName}'] as QueryKey,
    lists: (): QueryKey => ['${keyName}', 'list'],
    list: (filter?: Record<string, unknown>): QueryKey => ['${keyName}', 'list', filter],
    details: (): QueryKey => ['${keyName}', 'detail'],
    detail: (id: string): QueryKey => ['${keyName}', 'detail', id],
  },
`;
    }

    // Also add workflow keys for backwards compatibility
    for (const workflow of this.workflows) {
      const keyName = this.toCamelCase(workflow.name);
      
      // Skip if we already generated this key
      if (generatedKeys.has(keyName)) continue;
      generatedKeys.add(keyName);
      
      output += `  ${keyName}: {
    all: ['${keyName}'] as QueryKey,
    lists: (): QueryKey => ['${keyName}', 'list'],
    list: (filter?: Record<string, unknown>): QueryKey => ['${keyName}', 'list', filter],
    details: (): QueryKey => ['${keyName}', 'detail'],
    detail: (id: string): QueryKey => ['${keyName}', 'detail', id],
  },
`;
    }

    output += `};\n`;

    const outputPath = path.join(this.sdkDir, 'react', 'hooks', 'keys.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/hooks/keys.ts`);
  }

  private generateReactIndex(): void {
    let output = `// react/index.ts
// Single barrel export for all React hooks
// DO NOT EDIT - Generated by generate-canton-react.ts

export { CantonProvider, LedgerContext } from './context/LedgerContext';
export type { CantonProviderProps, LedgerContextValue } from './context/LedgerContext';
export { useLedger } from './context/useLedger';

// Core hooks for custom usage
export {
  useContractQuery,
  useContractMutation,
  useChoiceMutation,
  useSimpleChoiceMutation,
} from './hooks/core';
export type { ChoiceMutationInput } from './hooks/core';

// Typed query hooks for all templates
export {
`;

    // Export all typed template query hooks
    for (const template of this.allTemplates) {
      const hookName = this.generateQueryHookName(template.namespaceName);
      output += `  ${hookName},\n`;
    }

    // Also export legacy workflow hooks
    for (const workflow of this.workflows) {
      const pluralName = this.pluralize(workflow.name);
      output += `  use${pluralName},\n`;
    }

    output += `} from './hooks/queries';

// Mutation hooks for workflows
export {
`;

    for (const workflow of this.workflows) {
      for (const choice of workflow.choices) {
        const hookName = `use${this.capitalize(choice)}${workflow.name}`;
        output += `  ${hookName},\n`;
      }
    }

    for (const workflow of this.workflows) {
      output += `  use${workflow.name}Actions,\n`;
    }

    output += `} from './hooks/mutations';

// Query keys for cache management
export { queryKeys } from './hooks/keys';
`;

    const outputPath = path.join(this.sdkDir, 'react', 'index.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/index.ts`);
  }

  private pluralize(name: string): string {
    if (name.endsWith('y')) {
      return name.slice(0, -1) + 'ies';
    }
    if (name.endsWith('s') || name.endsWith('x') || name.endsWith('ch')) {
      return name + 'es';
    }
    return name + 's';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private toProgressiveTense(verb: string): string {
    const capitalized = this.capitalize(verb);
    // Handle words ending in 'e' (decline → Declining)
    if (capitalized.endsWith('e')) {
      return capitalized.slice(0, -1) + 'ing';
    }
    // Handle words ending in consonant + vowel + consonant (get → Getting)
    // Skip this for simplicity, most workflow verbs don't need it
    return capitalized + 'ing';
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node generate-canton-react.ts <sdk-dir> <project-name>');
    console.error('Example: npx ts-node generate-canton-react.ts ./sdk vault');
    process.exit(1);
  }

  const sdkDir = path.resolve(args[0]);
  const projectName = args[1];

  if (!fs.existsSync(sdkDir)) {
    console.error(`Error: SDK directory not found: ${sdkDir}`);
    process.exit(1);
  }

  const generator = new CantonReactGenerator(sdkDir, projectName);
  generator.generate();
}

main();
