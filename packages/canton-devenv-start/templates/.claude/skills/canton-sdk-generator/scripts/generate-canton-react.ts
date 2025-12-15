#!/usr/bin/env npx ts-node
/**
 * Canton React Hooks Generator
 *
 * Generates React Query hooks from the generated Canton API file.
 *
 * Design goals:
 * - Derive templates + choices from the actual generated API namespaces (no Request/Proposal assumption)
 * - Action-first naming: useAcceptFoo, useCreateFoo
 * - Query keys that actually match the keys used by core hooks (so invalidation works)
 * - Single barrel export
 *
 * Usage: npx ts-node generate-canton-react.ts <sdk-dir> <project-name>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface ChoiceFunctionInfo {
  functionName: string;
  choiceName: string;
  hasArgs: boolean;
}

interface TemplateHooksInfo {
  namespaceName: string;
  templateIdKey: string;

  /** Unique readable template segment for hook naming (e.g., VaultConfig) */
  hookSegment: string;
  /** queryKeys object property name (camelCase) */
  keyName: string;

  queryHookName: string;
  createHookName: string;
  actionsHookName: string;

  choices: ChoiceFunctionInfo[];
}

class CantonReactGenerator {
  private sdkDir: string;
  private projectName: string;

  private templateIds: string[] = [];
  private templates: TemplateHooksInfo[] = [];

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

    this.parseTemplateIds(sourceFile);
    this.parseTemplates(sourceFile);
    this.assignUniqueHookNames();

    const choiceCount = this.templates.reduce((n, t) => n + t.choices.length, 0);

    console.log(`   Found ${this.templateIds.length} template IDs`);
    console.log(`   Found ${this.templates.length} templates with Payload + create()`);
    console.log(`   Found ${choiceCount} choice functions`);
  }

  private parseTemplateIds(sourceFile: ts.SourceFile): void {
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isVariableStatement(node)) return;

      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== 'TemplateIds') continue;
        if (!decl.initializer) continue;

        let objLiteral: ts.ObjectLiteralExpression | null = null;

        if (ts.isObjectLiteralExpression(decl.initializer)) {
          objLiteral = decl.initializer;
        } else if (
          ts.isAsExpression(decl.initializer) &&
          ts.isObjectLiteralExpression(decl.initializer.expression)
        ) {
          objLiteral = decl.initializer.expression;
        }

        if (!objLiteral) continue;

        for (const prop of objLiteral.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            this.templateIds.push(prop.name.text);
          }
        }
      }
    });
  }

  private parseTemplates(sourceFile: ts.SourceFile): void {
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isModuleDeclaration(node) || !ts.isIdentifier(node.name)) return;

      const namespaceName = node.name.text;
      if (namespaceName === 'Query' || namespaceName === 'TypeGuards' || namespaceName === 'MockFactories') {
        return;
      }

      const templateIdKey = this.findTemplateIdKeyForNamespace(namespaceName);
      if (!templateIdKey) return;

      if (!node.body || !ts.isModuleBlock(node.body)) return;

      const hasPayload = node.body.statements.some(
        (member) =>
          ts.isInterfaceDeclaration(member) &&
          ts.isIdentifier(member.name) &&
          member.name.text === 'Payload'
      );
      if (!hasPayload) return;

      const hasCreate = node.body.statements.some(
        (member) =>
          ts.isFunctionDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === 'create'
      );
      if (!hasCreate) return;

      const choices: ChoiceFunctionInfo[] = [];

      for (const member of node.body.statements) {
        if (!ts.isFunctionDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) {
          continue;
        }

        const fnName = member.name.text;
        if (fnName === 'create') continue;

        const choiceName = this.extractChoiceNameFromFunction(member);
        if (!choiceName) continue;

        choices.push({
          functionName: fnName,
          choiceName,
          hasArgs: member.parameters.length >= 2,
        });
      }

      this.templates.push({
        namespaceName,
        templateIdKey,
        hookSegment: '',
        keyName: '',
        queryHookName: '',
        createHookName: '',
        actionsHookName: '',
        choices,
      });
    });
  }

  private extractChoiceNameFromFunction(fn: ts.FunctionDeclaration): string | null {
    if (!fn.body) return null;

    for (const stmt of fn.body.statements) {
      if (!ts.isReturnStatement(stmt) || !stmt.expression) continue;
      if (!ts.isObjectLiteralExpression(stmt.expression)) continue;

      for (const prop of stmt.expression.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;

        const propName = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : null;

        if (propName !== 'choice') continue;

        if (ts.isStringLiteral(prop.initializer)) {
          return prop.initializer.text;
        }
      }
    }

    return null;
  }

  private findTemplateIdKeyForNamespace(namespaceName: string): string | null {
    if (this.templateIds.includes(namespaceName)) {
      return namespaceName;
    }
    for (const id of this.templateIds) {
      if (id === namespaceName || id.endsWith(`_${namespaceName}`)) {
        return id;
      }
    }
    return null;
  }

  private assignUniqueHookNames(): void {
    const used = new Set<string>();

    for (const t of this.templates) {
      const segment = this.pickUniqueHookSegment(t.namespaceName, used);
      used.add(segment);

      t.hookSegment = segment;
      t.keyName = this.toCamelCase(segment);

      t.queryHookName = `use${this.pluralize(segment)}`;
      t.createHookName = `useCreate${segment}`;
      t.actionsHookName = `use${segment}Actions`;
    }
  }

  private pickUniqueHookSegment(namespaceName: string, used: Set<string>): string {
    const parts = namespaceName.split('_').filter(Boolean);
    const cleanedParts = parts.map((p) => this.sanitizeIdentifier(p)).filter(Boolean);

    // Candidate 1: last segment
    const candidates: string[] = [];
    if (cleanedParts.length > 0) {
      candidates.push(cleanedParts[cleanedParts.length - 1]);
    }

    // Candidate 2..N: prepend more context from the right
    for (let take = 2; take <= Math.min(6, cleanedParts.length); take++) {
      const slice = cleanedParts.slice(-take);
      candidates.push(slice.join(''));
    }

    // Final fallback: full concatenation
    candidates.push(cleanedParts.join(''));

    for (const cand of candidates) {
      const normalized = this.ensureValidIdentifier(cand);
      if (!normalized) continue;
      if (!used.has(normalized)) return normalized;
    }

    // Absolute last resort: add a numeric suffix
    const base = this.ensureValidIdentifier(cleanedParts[cleanedParts.length - 1] || 'Template');
    let i = 2;
    while (used.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  private sanitizeIdentifier(value: string): string {
    return value.replace(/[^A-Za-z0-9_]/g, '');
  }

  private ensureValidIdentifier(value: string): string {
    const v = this.sanitizeIdentifier(value);
    if (!v) return '';
    if (/^[A-Za-z_]/.test(v)) return v;
    return `_${v}`;
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
    () =>
      providedClient ??
      new QueryClient({
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
      <LedgerContext.Provider value={contextValue}>{children}</LedgerContext.Provider>
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

`;

    for (const t of this.templates) {
      const payloadType = `API.${t.namespaceName}.Payload`;
      output += `/** Query ${t.namespaceName} contracts with full type safety. */
export function ${t.queryHookName}(
  filter?: Partial<${payloadType}>,
  options?: { enabled?: boolean }
): UseQueryResult<Contract<${payloadType}>[]> {
  return useContractQuery<${payloadType}>(TemplateIds.${t.templateIdKey}, filter, options);
}

`;
    }

    const outputPath = path.join(this.sdkDir, 'react', 'hooks', 'queries.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`   ✓ react/hooks/queries.ts`);
  }

  private generateMutationHooks(): void {
    let output = `// react/hooks/mutations.ts
// Generated mutation hooks (action-first naming)
// DO NOT EDIT - Generated by generate-canton-react.ts

import { useContractMutation, useChoiceMutation, useSimpleChoiceMutation } from './core';
import { TemplateIds } from '../../${this.projectName}-api';
import type * as API from '../../${this.projectName}-api';
import type { Command } from '../../core';
import { queryKeys } from './keys';

type CommandResult<T> = T extends Command<infer R> ? R : unknown;

`;

    for (const t of this.templates) {
      const payloadType = `API.${t.namespaceName}.Payload`;

      // Create hook
      output += `/** Create ${t.hookSegment} contracts */
export function ${t.createHookName}() {
  return useContractMutation<${payloadType}>(TemplateIds.${t.templateIdKey}, {
    invalidateQueries: [queryKeys.${t.keyName}.all],
  });
}

`;

      // Choice hooks
      for (const c of t.choices) {
        const hookName = `use${this.capitalize(c.functionName)}${t.hookSegment}`;
        const fnRef = `API.${t.namespaceName}.${c.functionName}`;
        const resultType = `CommandResult<ReturnType<typeof ${fnRef}>>`;

        if (c.hasArgs) {
          const argsType = `Parameters<typeof ${fnRef}>[1]`;
          output += `/** Exercise ${c.choiceName} on ${t.hookSegment} */
export function ${hookName}() {
  return useChoiceMutation<${argsType}, ${resultType}>(
    TemplateIds.${t.templateIdKey},
    '${c.choiceName}',
    { invalidateQueries: [queryKeys.${t.keyName}.all] }
  );
}

`;
        } else {
          output += `/** Exercise ${c.choiceName} on ${t.hookSegment} */
export function ${hookName}() {
  return useSimpleChoiceMutation<${resultType}>(
    TemplateIds.${t.templateIdKey},
    '${c.choiceName}',
    { invalidateQueries: [queryKeys.${t.keyName}.all] }
  );
}

`;
        }
      }

      // Grouped actions hook
      output += `/** Grouped actions for ${t.hookSegment} */
export function ${t.actionsHookName}() {
  const createMutation = ${t.createHookName}();
`;

      for (const c of t.choices) {
        const choiceHook = `use${this.capitalize(c.functionName)}${t.hookSegment}`;
        output += `  const ${c.functionName}Mutation = ${choiceHook}();
`;
      }

      output += `
  return {
    /** Create ${t.hookSegment} */
    create: (payload: ${payloadType}) => createMutation.mutateAsync(payload),
    isCreating: createMutation.isPending,
`;

      for (const c of t.choices) {
        const fnRef = `API.${t.namespaceName}.${c.functionName}`;
        const progressive = this.toProgressiveTense(c.functionName);

        if (c.hasArgs) {
          const argsType = `Parameters<typeof ${fnRef}>[1]`;
          output += `    /** ${c.choiceName} */
    ${c.functionName}: (contractId: string, args: ${argsType}) =>
      ${c.functionName}Mutation.mutateAsync({ contractId, args }),
    is${progressive}: ${c.functionName}Mutation.isPending,
`;
        } else {
          output += `    /** ${c.choiceName} */
    ${c.functionName}: (contractId: string) => ${c.functionName}Mutation.mutateAsync(contractId),
    is${progressive}: ${c.functionName}Mutation.isPending,
`;
        }
      }

      const errorExpr = ['createMutation.error', ...t.choices.map((c) => `${c.functionName}Mutation.error`)].join(' || ');
      output += `    error: ${errorExpr},
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
import { TemplateIds } from '../../${this.projectName}-api';

// These keys are intentionally shaped to match react/hooks/core.ts:
// queryKey: ['contracts', templateId, filter]

export const queryKeys = {
`;

    for (const t of this.templates) {
      output += `  /** Query keys for ${t.namespaceName} */
  ${t.keyName}: {
    all: ['contracts', TemplateIds.${t.templateIdKey}] as QueryKey,
    list: (filter?: unknown): QueryKey => ['contracts', TemplateIds.${t.templateIdKey}, filter],
  },
`;
    }

    output += `} as const;
`;

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

// Typed query hooks
export {
`;

    for (const t of this.templates) {
      output += `  ${t.queryHookName},
`;
    }

    output += `} from './hooks/queries';

// Typed mutation hooks
export {
`;

    for (const t of this.templates) {
      output += `  ${t.createHookName},
`;
      for (const c of t.choices) {
        const hookName = `use${this.capitalize(c.functionName)}${t.hookSegment}`;
        output += `  ${hookName},
`;
      }
      output += `  ${t.actionsHookName},
`;
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
    if (capitalized.endsWith('e')) {
      return capitalized.slice(0, -1) + 'ing';
    }
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

if (require.main === module) {
  main();
}
