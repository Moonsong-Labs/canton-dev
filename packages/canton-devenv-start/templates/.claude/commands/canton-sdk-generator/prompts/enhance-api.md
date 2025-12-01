# Canton API Enhancement Prompt

Apply these enhancements to the generated `<project-name>-api.ts` to create a production-ready, React-friendly API.

---

## 1. QUERY HELPERS

Add after the workflow sections:

```typescript
// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Query helpers for fetching contracts from the ledger.
 * Use with your ledger connection to fetch typed contracts.
 *
 * @example
 * ```tsx
 * const accounts = await ledger.query(Query.accounts({ owner: party }));
 * ```
 */
export namespace Query {
  /** Query accounts with optional filter */
  export function accounts(filter?: Partial<Account>) {
    return { templateId: TemplateIds.Account_Account, filter };
  }

  /** Query holdings (TransferableFungible) */
  export function holdings(filter?: Partial<Holding>) {
    return { templateId: TemplateIds.Holding_TransferableFungible, filter };
  }

  /** Query fungible holdings */
  export function fungibleHoldings(filter?: Partial<Fungible>) {
    return { templateId: TemplateIds.Holding_Fungible, filter };
  }

  /** Query instruments */
  export function instruments(filter?: Partial<Instrument>) {
    return { templateId: TemplateIds.Instrument_Instrument, filter };
  }

  /** Query pending account creation requests */
  export function accountRequests(filter?: Partial<CreateAccount.Request>) {
    return { templateId: TemplateIds.Workflow_CreateAccount_Request, filter };
  }

  /** Query pending transfer requests */
  export function transferRequests(filter?: Partial<Transfer.Request>) {
    return { templateId: TemplateIds.Workflow_Transfer_Request, filter };
  }

  /** Query pending credit requests */
  export function creditRequests(filter?: Partial<CreditAccount.Request>) {
    return { templateId: TemplateIds.Workflow_CreditAccount_Request, filter };
  }

  /** Query pending DvP proposals */
  export function dvpProposals(filter?: Partial<DvP.Proposal>) {
    return { templateId: TemplateIds.Workflow_DvP_Proposal, filter };
  }

  /** Query settlement batches */
  export function batches(filter?: Partial<Batch>) {
    return { templateId: TemplateIds.Settlement_Batch, filter };
  }

  /** Query settlement instructions */
  export function instructions(filter?: Partial<Instruction>) {
    return { templateId: TemplateIds.Settlement_Instruction, filter };
  }
}
```

---

## 2. TYPE GUARDS

Add runtime type checking utilities:

```typescript
// ═══════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════

/**
 * Runtime type guards for contract payloads.
 * Use when you need to verify contract types at runtime.
 *
 * @example
 * ```tsx
 * if (TypeGuards.isAccount(payload)) {
 *   console.log(payload.custodian); // TypeScript knows this is Account
 * }
 * ```
 */
export const TypeGuards = {
  isAccount: (v: unknown): v is Account =>
    typeof v === 'object' && v !== null &&
    'custodian' in v && 'owner' in v && 'holdingFactory' in v,

  isHolding: (v: unknown): v is Holding =>
    typeof v === 'object' && v !== null &&
    'instrument' in v && 'account' in v && 'amount' in v,

  isFungible: (v: unknown): v is Fungible =>
    TypeGuards.isHolding(v),

  isTransferable: (v: unknown): v is Transferable =>
    TypeGuards.isHolding(v),

  isTransferableFungible: (v: unknown): v is TransferableFungible =>
    TypeGuards.isHolding(v),

  isInstrument: (v: unknown): v is Instrument =>
    typeof v === 'object' && v !== null &&
    'depository' in v && 'issuer' in v && 'holdingStandard' in v,

  isBatch: (v: unknown): v is Batch =>
    typeof v === 'object' && v !== null &&
    'instructor' in v && 'settlers' in v && 'routedStepsWithInstructionId' in v,

  isInstruction: (v: unknown): v is Instruction =>
    typeof v === 'object' && v !== null &&
    'batchId' in v && 'routedStep' in v && 'allocation' in v,

  isAccountKey: (v: unknown): v is AccountKey =>
    typeof v === 'object' && v !== null &&
    'custodian' in v && 'owner' in v && 'id' in v,

  isInstrumentKey: (v: unknown): v is InstrumentKey =>
    typeof v === 'object' && v !== null &&
    'depository' in v && 'issuer' in v && 'id' in v && 'version' in v,
} as const;
```

---

## 3. MOCK FACTORIES

Add testing utilities:

```typescript
// ═══════════════════════════════════════════════════════════════
// MOCK FACTORIES (Testing)
// ═══════════════════════════════════════════════════════════════

/**
 * Mock factories for creating test data.
 * Use in unit tests to generate valid contract payloads.
 *
 * @example
 * ```tsx
 * const mockAccount = MockFactories.account({ description: 'Test' });
 * const mockHolding = MockFactories.holding({ amount: '500.00' });
 * ```
 */
export const MockFactories = {
  /** Create a mock party identifier */
  party: (name: string = 'TestParty'): Party => `${name}::1220test`,

  /** Create a mock Id */
  id: (value: string = 'test-id'): Id => ({ unpack: value }),

  /** Create a mock AccountKey */
  accountKey: (overrides?: Partial<AccountKey>): AccountKey => ({
    custodian: MockFactories.party('Custodian'),
    owner: MockFactories.party('Owner'),
    id: MockFactories.id('account-1'),
    ...overrides,
  }),

  /** Create a mock InstrumentKey */
  instrumentKey: (overrides?: Partial<InstrumentKey>): InstrumentKey => ({
    depository: MockFactories.party('Depository'),
    issuer: MockFactories.party('Issuer'),
    id: MockFactories.id('USD'),
    version: '1',
    holdingStandard: { tag: 'TransferableFungible' },
    ...overrides,
  }),

  /** Create a mock HoldingFactoryKey */
  holdingFactoryKey: (overrides?: Partial<HoldingFactoryKey>): HoldingFactoryKey => ({
    provider: MockFactories.party('Provider'),
    id: MockFactories.id('holding-factory'),
    ...overrides,
  }),

  /** Create a mock Quantity */
  quantity: (amount: Numeric = '100.00', unit?: InstrumentKey): Quantity => ({
    unit: unit ?? MockFactories.instrumentKey(),
    amount,
  }),

  /** Create a mock Account */
  account: (overrides?: Partial<Account>): Account => ({
    custodian: MockFactories.party('Custodian'),
    owner: MockFactories.party('Owner'),
    lock: null,
    controllers: { outgoing: [], incoming: [] },
    id: MockFactories.id('account-1'),
    description: 'Test Account',
    holdingFactory: MockFactories.holdingFactoryKey(),
    observers: {},
    ...overrides,
  }),

  /** Create a mock Holding */
  holding: (overrides?: Partial<Holding>): Holding => ({
    instrument: MockFactories.instrumentKey(),
    account: MockFactories.accountKey(),
    amount: '1000.00',
    lock: null,
    observers: {},
    ...overrides,
  }),

  /** Create a mock Instrument */
  instrument: (overrides?: Partial<Instrument>): Instrument => ({
    depository: MockFactories.party('Depository'),
    issuer: MockFactories.party('Issuer'),
    id: MockFactories.id('USD'),
    version: '1',
    holdingStandard: { tag: 'TransferableFungible' },
    description: 'US Dollar',
    validAsOf: new Date().toISOString(),
    observers: {},
    ...overrides,
  }),

  /** Wrap payload as Contract with ID */
  contract: <T>(payload: T, contractId?: string): Contract<T> => ({
    contractId: (contractId ?? `00${Math.random().toString(36).slice(2)}`) as ContractId<T>,
    payload,
    createdAt: new Date().toISOString(),
  }),
};
```

---

## 4. REACT QUERY INTEGRATION

Add React Query types and utilities:

```typescript
// ═══════════════════════════════════════════════════════════════
// REACT QUERY INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Query key factories for @tanstack/react-query.
 * Ensures consistent cache key management.
 *
 * @example
 * ```tsx
 * const { data } = useQuery({
 *   queryKey: QueryKeys.accounts(party),
 *   queryFn: () => ledger.query(Query.accounts({ owner: party }))
 * });
 * ```
 */
export const QueryKeys = {
  accounts: (party?: Party) => ['accounts', party] as const,
  holdings: (account?: AccountKey) => ['holdings', account] as const,
  instruments: () => ['instruments'] as const,
  requests: {
    account: (party?: Party) => ['requests', 'account', party] as const,
    transfer: (party?: Party) => ['requests', 'transfer', party] as const,
    credit: (party?: Party) => ['requests', 'credit', party] as const,
  },
  proposals: {
    dvp: (party?: Party) => ['proposals', 'dvp', party] as const,
  },
  settlement: {
    batches: (party?: Party) => ['settlement', 'batches', party] as const,
    instructions: (batchId?: Id) => ['settlement', 'instructions', batchId] as const,
  },
} as const;

/** Query result type for contract queries (compatible with @tanstack/react-query v5) */
export interface UseContractQueryResult<T> {
  data: Contract<T>[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Mutation result type for contract exercises */
export interface UseContractMutationResult<TArgs, TResult> {
  mutate: (args: TArgs) => void;
  mutateAsync: (args: TArgs) => Promise<TResult>;
  data: TResult | undefined;
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
  reset: () => void;
}

/** Suspense-compatible query result (data is always defined) */
export interface UseSuspenseQueryResult<T> {
  data: Contract<T>[];
  refetch: () => Promise<void>;
  isFetching: boolean;
}
```

---

## 5. LEDGER CONNECTION INTERFACE

Add ledger abstraction:

```typescript
// ═══════════════════════════════════════════════════════════════
// LEDGER CONNECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Ledger connection interface.
 * Implement this interface to connect the API to your ledger client.
 */
export interface LedgerConnection {
  /** Query contracts by template ID with optional filter */
  query<T>(templateId: string, filter?: Partial<T>): Promise<Contract<T>[]>;

  /** Exercise a choice on a contract */
  exercise<T, R>(contractId: ContractId<T>, choice: string, args: unknown): Promise<ExerciseResult<R>>;

  /** Create a new contract */
  create<T>(templateId: string, payload: T): Promise<ContractId<T>>;

  /** Fetch a specific contract by ID */
  fetch<T>(contractId: ContractId<T>): Promise<Contract<T> | null>;
}

/**
 * Ledger context for React components.
 */
export interface LedgerContext {
  party: Party;
  ledger: LedgerConnection;
  isConnected: boolean;
}
```

---

## 6. TEST ASSERTIONS

Add test assertion helpers:

```typescript
// ═══════════════════════════════════════════════════════════════
// TEST ASSERTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Type assertion utilities for tests.
 * Throw errors if type guards fail.
 */
export const TestAssertions = {
  assertAccount: (v: unknown): asserts v is Account => {
    if (!TypeGuards.isAccount(v)) throw new Error('Value is not an Account');
  },
  assertHolding: (v: unknown): asserts v is Holding => {
    if (!TypeGuards.isHolding(v)) throw new Error('Value is not a Holding');
  },
  assertInstrument: (v: unknown): asserts v is Instrument => {
    if (!TypeGuards.isInstrument(v)) throw new Error('Value is not an Instrument');
  },
  assertBatch: (v: unknown): asserts v is Batch => {
    if (!TypeGuards.isBatch(v)) throw new Error('Value is not a Batch');
  },
  assertInstruction: (v: unknown): asserts v is Instruction => {
    if (!TypeGuards.isInstruction(v)) throw new Error('Value is not an Instruction');
  },
};
```

---

## VALIDATION

After applying enhancements:

1. Run `npx tsc --noEmit` to validate TypeScript
2. Fix any type errors
3. Ensure all imports reference `./core/primitives` and `./core/interfaces`

---

## FINAL STRUCTURE

The enhanced `<project-name>-api.ts` should have these sections in order:

1. Imports
2. Template IDs
3. **WORKFLOWS** (CreateAccount, Transfer, CreditAccount, DvP)
4. Holding Types
5. Settlement Types
6. Account Types
7. Instrument Types
8. **QUERY HELPERS** (new)
9. **TYPE GUARDS** (new)
10. **MOCK FACTORIES** (new)
11. **REACT QUERY INTEGRATION** (new)
12. **LEDGER CONNECTION** (new)
13. **TEST ASSERTIONS** (new)
