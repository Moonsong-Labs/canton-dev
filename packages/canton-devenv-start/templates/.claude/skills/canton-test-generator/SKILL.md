---
name: canton-test-generator
description: Generate TypeScript tests from Daml scripts. Use when user mentions "generate tests", "create tests for canton", or "generate canton tests".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Generate Canton TypeScript Tests

Generate TypeScript integration tests that mirror Daml test scripts, using the SDK.

---

## Prerequisites

This skill requires a pre-generated SDK. Before running:

1. Check for SDK at `<project-path>/sdk`
2. Verify SDK has `<project-name>-api.ts` with template namespaces
3. If SDK doesn't exist, tell user: "Please run the canton-sdk-generator skill first to create the SDK."

---

## STEP 1: Discover Daml Project

Look for Daml project configuration:

1. Check for `daml.yaml` in workspace - extract project name
2. Verify SDK exists at `<project-path>/sdk/<project-name>-api.ts`

---

## STEP 2: Check for Daml Test Scripts

Look for Daml test scripts:

```bash
ls <project-path>/daml/Scripts/tests/
```

**If directory does NOT exist or is empty**:
1. Inform user: "No Daml test scripts found at `<project-path>/daml/Scripts/tests/`"
2. Explain: "This skill generates TypeScript tests by reading Daml test scripts. To use it, create `.daml` script files that define test workflows."
3. **Stop** - do not proceed.

---

## STEP 3: Check for Setup.daml (Convention)

**Convention**: If `<project-path>/daml/Scripts/Setup.daml` exists, it contains ledger setup logic (party allocation, initial contracts, configuration) that should run before all tests.

Check for the setup file:
```bash
ls <project-path>/daml/Scripts/Setup.daml
```

**If Setup.daml exists**, create `sdk/__tests__/testSetup.ts`:

1. Read `Setup.daml` and understand what it sets up (factories, instruments, accounts, initial state)
2. **Extract actual values** - note the specific IDs, amounts, and configuration values used (e.g., `configId = "config-001"`, not made-up values)
3. **Create a `testSetup.ts` that CREATES the same contracts** - the setup file must replicate the Setup.daml logic using the SDK, actually creating contracts on the ledger
4. Export parties (from environment variables), ledger clients, and any contract IDs created
5. **Export configuration values** as constants so tests use the same values as Setup.daml
6. Use vitest's `beforeAll` to run the setup once before all tests
7. Test files will import what they need from this setup file

**CRITICAL**: The `testSetup.ts` must actually CREATE contracts, not just verify they exist. It replaces Setup.daml for TypeScript tests. The tests should be runnable on a fresh ledger with only the DAR deployed.

**CRITICAL**: Never hardcode different values than what Setup.daml uses. Read the setup script and use the EXACT same IDs, amounts, and configuration.

### testSetup.ts Structure

The setup file should:

1. **Check if setup already ran** - Query for a key contract created by setup (e.g., a config or state contract). If it exists, skip creation to allow re-running tests.
2. **Re-fund user accounts if needed** - When reusing existing state, users may have consumed their holdings from previous test runs. Check and re-fund if necessary.
3. **Create factories** - Account factory, holding factory, token factory
4. **Create instruments** - Tokens/assets the system uses
5. **Create accounts** - User accounts via workflow requests
6. **Fund accounts** - Credit initial balances via workflow requests
7. **Create state contracts** - Config, state, and other initial contracts
8. **Export everything tests need** - Parties, clients, keys, contract IDs, constants

```typescript
// testSetup.ts structure
import { beforeAll } from 'vitest';
import { TemplateIds, Query, Account_Account_Factory, ... } from '../<project>-api';
import type { Party, ContractId, Id, Numeric } from '../core/primitives';
import type { AccountKey, InstrumentKey, HoldingFactoryKey } from '../core/interfaces';
import { createLedgerClient } from '../ledger';

// Party configuration from environment (names depend on your Setup.daml)
export const user = process.env.USER_PARTY as Party;
export const operator = process.env.OPERATOR_PARTY as Party;

if (!user || !operator) {
  throw new Error('USER_PARTY and OPERATOR_PARTY environment variables required');
}

// Ledger clients - one per party
export const userLedger = createLedgerClient(user);
export const operatorLedger = createLedgerClient(operator);

// Configuration constants (MUST match Setup.daml exactly - read from the file!)
export const configId: Id = { unpack: "config-001" };  // Example - use actual value from Setup.daml
export const initialAmount: Numeric = "1000.0";        // Example - use actual value from Setup.daml
// ... other constants extracted from Setup.daml

// Keys and IDs that will be populated during setup
export let userAccount: AccountKey;
export let primaryInstrument: InstrumentKey;
export let mainConfigCid: ContractId<unknown>;
// ... other exports based on what Setup.daml creates

beforeAll(async () => {
  // Check if setup already ran by querying for a key contract from Setup.daml
  const existingState = await operatorLedger.query(TemplateIds.YourProject_State_MainState);
  if (existingState.length > 0) {
    console.log('Setup already completed, reusing existing contracts');
    // Populate exports from existing contracts (keys, instruments, etc.)

    // IMPORTANT: Re-fund user accounts if they consumed holdings in previous runs
    const userHoldings = await userLedger.query(TemplateIds.Holding_TransferableFungible);
    const relevantHoldings = userHoldings.filter(h =>
      h.payload.instrument.id.unpack === "TOKEN-ID" && h.payload.account.owner === user
    );
    if (relevantHoldings.length === 0) {
      console.log('Re-funding user account...');
      // Credit user with initial balance again using workflow
      const creditCmd = Workflow_CreditAccount_Request.create({ ... });
      // ... accept the credit request
    }
    return;
  }

  console.log('Running ledger setup...');

  // 1. Create factories (Daml Finance standard pattern)
  const accountFactoryCmd = Account_Account_Factory.create({ provider: operator, observers: [] });
  const accountFactoryCid = await operatorLedger.create(accountFactoryCmd.templateId, accountFactoryCmd.argument);

  // Create Holding Factory AND its Reference (Reference is required for account creation)
  const holdingFactoryCmd = Holding_Factory.create({
    provider: operator,
    id: { unpack: "Holding Factory" },
    observers: []
  });
  const holdingFactoryCid = await operatorLedger.create(holdingFactoryCmd.templateId, holdingFactoryCmd.argument);

  // IMPORTANT: Create Holding Factory Reference - accounts need this to find the factory
  const holdingFactoryRefCmd = Holding_Factory_Reference.create({
    factoryView: { provider: operator, id: { unpack: "Holding Factory" } } as any,
    cid: holdingFactoryCid as any,
    observers: []
  });
  await operatorLedger.create(holdingFactoryRefCmd.templateId, holdingFactoryRefCmd.argument);

  // 2. Create instruments (token factory pattern)
  // ... create Token_Factory, then Token_Instrument for each asset

  // 3. Create accounts via workflow - pass holdingFactory key (not CID)
  const holdingFactory: HoldingFactoryKey = {
    provider: operator,
    id: { unpack: "Holding Factory" }
  };
  // CreateAccount.Request.accept needs: accountFactoryCid, holdingFactory, observers
  // ... CreateAccount.Request + Accept for each user

  // 4. Fund accounts (credit initial balances)
  // ... CreditAccount.Request + Accept for initial holdings

  // 5. Create application-specific state contracts
  // ... Your project's config and state templates

  console.log('Setup complete!');
}, 60000); // 60 second timeout for setup
```

**If Setup.daml does NOT exist**, skip this step. Tests will handle their own setup.

---

## STEP 4: Translate Each Daml Script to TypeScript

For each `.daml` file in `Scripts/tests/`:

**Goal**: Create a TypeScript test that achieves the **same end result** as the DAML script, using the SDK. The translation doesn't need to be 1:1 - what matters is that the test verifies the same workflow behavior.

### Translation Rules

1. **Read the DAML script completely** - understand what workflow is being tested and what the expected outcome is
2. **Extract values from DAML** - use the same IDs, amounts, and references as the DAML script (don't invent new values)
3. **Write clean TypeScript** - use the SDK to achieve the same result:
   - Create contracts with `TemplateName.create({...})` + `ledger.create()`
   - Exercise choices with `TemplateName.choiceName(cid, args)` + `ledger.exercise()`
   - Query contracts using the `Query` helper - **IMPORTANT**: The `Query.<templateName>()` functions return a `QuerySpec` object with `templateId` and `filter` properties. You must pass these separately to `ledger.query()`:
     ```typescript
     // CORRECT - destructure the QuerySpec
     const spec = Query.yourProject_State_MainState({ operator });
     const contracts = await ledger.query(spec.templateId, spec.filter);

     // Or inline destructuring:
     const { templateId, filter } = Query.holding_Fungible({ account: accountKey });
     const holdings = await ledger.query(templateId, filter);

     // WRONG - do NOT pass QuerySpec directly (causes "templateId.split is not a function")
     // const contracts = await ledger.query(Query.yourProject_State_MainState());
     ```
4. **Apply DRY** - extract helpers for repeated patterns, don't duplicate code
5. **Map parties** - DAML party names become environment variables (e.g. `user` → `process.env.USER_PARTY`)
6. **Verify the same outcome** - the test should assert that the final state matches what the DAML script expects

### Test Independence

Each test should be **runnable independently** where possible:
- If a test depends on prior state (e.g., a withdrawal requires a prior credit), either:
  - Create the required state in the test's own `beforeAll`
  - OR clearly document the dependency and required test order

**IMPORTANT**: Test file execution order is not guaranteed. Prefer making each test self-contained.
If you must enforce order (last resort), prefix filenames with numbers (e.g., `01_`, `02_`, `03_`).

### Setup Verification

In `beforeAll()`, **verify the ledger is properly set up** before running tests:
- Query for expected contracts from Setup.daml
- Throw a clear error if setup contracts are missing (e.g., "Setup contracts not found. Ensure `daml start` completed successfully.")

### CRITICAL: Query API Pattern

The SDK's `Query.<templateName>()` functions return a `QuerySpec` object, NOT a template ID string. You **MUST** destructure the result before passing to `ledger.query()`:

```typescript
// ✅ CORRECT - destructure templateId and filter from QuerySpec
const spec = Query.yourProject_State_MainState({ operator });
const contracts = await ledger.query(spec.templateId, spec.filter);

// ✅ CORRECT - inline destructuring also works
const { templateId, filter } = Query.holding_Fungible({ account });
const holdings = await ledger.query(templateId, filter);

// ❌ WRONG - passing QuerySpec directly causes runtime error
// "TypeError: templateId.split is not a function"
const contracts = await ledger.query(Query.yourProject_State_MainState());
```

This pattern applies to ALL query calls in tests. Always destructure first.

### CRITICAL: Canton Type System

Canton/Daml Finance uses wrapped types for type safety. You **MUST** use these correctly:

#### 1. `Id` Type - Wrapped string identifier

The `Id` type is NOT a plain string. It has an `unpack` property:

```typescript
// SDK type definition:
export interface Id {
  unpack: string;
}

// ✅ CORRECT - use { unpack: "value" } format
const configId: Id = { unpack: "config-001" };
const instrumentId: Id = { unpack: "USD" };
const accountId: Id = { unpack: "User@Operator" };

// ❌ WRONG - plain strings cause type errors
const configId = "config-001";  // Type 'string' is not assignable to type 'Id'
```

This applies to ALL id fields: `configId`, `instrument.id`, `account.id`, `holdingFactory.id`, etc.

#### 2. `Numeric` Type - String-based decimal

The `Numeric` type is a **string**, not a number. This preserves decimal precision:

```typescript
// SDK type definition:
export type Numeric = string;

// ✅ CORRECT - use string literals for amounts
const amount: Numeric = "500.0";
const price: Numeric = "1.0";
const initialBalance: Numeric = "1000.0";

// ❌ WRONG - numbers cause type errors
const amount = 500.0;  // Type 'number' is not assignable to type 'string'
```

#### 3. Arithmetic with Numeric

Since `Numeric` is a string, you must parse before arithmetic:

```typescript
// ✅ CORRECT - parse to number for calculations
const amount = "500.0";
const price = "1.0";
const expectedResult = parseFloat(amount) / parseFloat(price);

// For comparisons with contract data:
const actualAmount = parseFloat(contractState.payload.totalAmount);
expect(actualAmount).toBeCloseTo(expectedResult, 6);

// ❌ WRONG - direct arithmetic on strings
const result = amount / price;  // NaN or type error
```

#### 4. InstrumentKey and AccountKey

These compound types contain `Id` fields:

```typescript
// ✅ CORRECT - nested Id objects with all required fields
const instrumentKey: InstrumentKey = {
  depository: custodianParty,
  issuer: custodianParty,
  id: { unpack: "USD" },        // Id type, not string
  version: "0",
  holdingStandard: { tag: "TransferableFungible" }  // Enum as tagged object
};

const accountKey: AccountKey = {
  custodian: custodianParty,
  owner: userParty,
  id: { unpack: "User@Operator" }  // Id type, not string
};

// ❌ WRONG - plain string ids
const instrumentKey = {
  depository: custodianParty,
  issuer: custodianParty,
  id: "USD",  // Type error!
  version: "0"
};
```

#### 5. ContractId Type Casting

When exercising choices, you often need to cast `ContractId<unknown>` to the specific payload type:

```typescript
// The create() returns ContractId<unknown>, but accept() needs ContractId<Payload>
const requestCid = await ledger.create(requestCmd.templateId, requestCmd.argument);

// ✅ CORRECT - cast to specific ContractId type
const acceptCmd = Workflow_CreateAccount_Request.accept(
  requestCid as ContractId<Workflow_CreateAccount_Request.Payload>
);

// Then exercise:
await ledger.exercise(
  acceptCmd.templateId!,
  requestCid,
  acceptCmd.choice!,
  { /* choice arguments */ }
);

// ❌ WRONG - using ContractId<unknown> directly causes type errors
const acceptCmd = Workflow_CreateAccount_Request.accept(requestCid);  // Type error
```

**Extracting Choice Results**: Daml choices can return values. Access them via `exerciseResult`:

```typescript
// Exercise returns the choice's return value in exerciseResult
const result = await ledger.exercise(
  acceptCmd.templateId!,
  requestCid,
  acceptCmd.choice!,
  { label: "User@Operator", description: "User account", accountFactoryCid, holdingFactory, observers: [] }
);

// Cast the result to the expected return type (depends on what the Daml choice returns)
const accountKey = result.exerciseResult as AccountKey;
```

#### 6. Daml Enum vs Variant JSON Encoding (CRITICAL)

Daml has **enums** and **variants** and they serialize differently in the JSON API:

- **Enums** (no payload) serialize as **strings**:
  - JSON: `"TransferableFungible"`
- **Variants** (sum types) serialize as **objects**:
  - JSON: `{ "tag": "Constructor", "value": <payload> }`
  - If the constructor has no payload, the JSON may be `{ "tag": "Constructor" }`

**Daml Finance note**: `HoldingStandard` is commonly an **enum** in practice, so the JSON API expects a string.

```typescript
// Example enum value (JSON: "TransferableFungible")
const holdingStandard = "TransferableFungible" as any;

// Example variant value (JSON: { tag, value })
const someVariant = { tag: "SomeCase", value: { /* payload */ } } as any;
```

**Rule of thumb**:
- If the generated type looks like a **string union**, pass a string.
- If it looks like a union of `{ tag: ... }` objects, pass the tagged object.

#### 7. Type Imports

Import the necessary types from the SDK:

```typescript
import type { Id, Numeric, Party, ContractId, DamlMap } from '../core/primitives';
import type { InstrumentKey, AccountKey, HoldingFactoryKey } from '../core/interfaces';
```

#### 8. `Map` Types in Daml JSON API

Daml `Map` types are serialized as arrays of key-value pairs, NOT as objects:

```typescript
// Daml type: Map Text (Set Party)
// Used for: observers field in many Daml Finance templates

// ✅ CORRECT - empty Map is an empty array
const observers: DamlMap<string, Party[]> = [];

// ✅ CORRECT - Map with entries is array of [key, value] pairs
const observersWithData: DamlMap<string, Party[]> = [["label1", [party1, party2]]];

// ❌ WRONG - object format causes serialization errors
const observers = {};  // Will fail at runtime
```

This applies to all `observers` fields in Daml Finance templates (Account_Factory, Holding_Factory, Token_Instrument, etc.).

#### 8.1 Query Filters: Avoid Enums/Variants When Possible

The JSON API query predicate parser can be fragile with nested enum/variant fields inside filters.
If a record field contains an enum/variant (e.g., `InstrumentKey.holdingStandard`), prefer **query-safe filters**:

- Build a filter that omits enum/variant fields (partial record matching), e.g. `Omit<InstrumentKey, 'holdingStandard'>`
- Or filter by primitive sub-fields (issuer/depository/id/version) rather than the entire nested record

#### 9. Daml Finance Holdings Behavior

When working with holdings in Daml Finance workflows:

```typescript
// IMPORTANT: Many Daml workflows transfer the ENTIRE holding, regardless of amount parameter
// The amount field is often used only for calculations (e.g., share allocation),
// not for splitting the holding.

// If you need to transfer a partial amount:
// 1. First split the holding using Fungible.Split interface
// 2. Then use the split holding in the workflow

// Example: If user has 1000 USD and wants to transfer 500
// Option A: Deposit all 1000 (simpler)
const depositAmount = "1000.0";  // Full balance

// Option B: Split first (if Daml contract supports it)
// const splitCmd = ... // Split 1000 into 500 + 500
// Use the 500 holding for deposit, keep the other
```

---

## STEP 5: Generate TypeScript Test Files

For each Daml script, create a corresponding test file at `sdk/__tests__/<script-name>.test.ts`.

### Required: Prerequisites Comment

Every test file MUST start with a prerequisites comment:

```typescript
/**
 * Tests generated from: <script-name>.daml
 *
 * Prerequisites:
 * 1. Start Canton ledger: `daml start`
 * 2. Setup script runs automatically via init-script in daml.yaml
 * 3. Set environment variables: USER_PARTY, OPERATOR_PARTY (from ledger output)
 *
 * Workflow: <brief description of what this tests>
 */
```

### Required: Descriptive Assertions

Use descriptive assertion messages that explain what's being checked:

```typescript
// BAD - no context on failure
expect(holdings.length).toBeGreaterThan(0);

// GOOD - explains what should exist and why
expect(holdings.length, 'User should have USD holdings from setup script').toBeGreaterThan(0);
```

### Test File Structure (with Setup)

If `testSetup.ts` was created, import from it:

```typescript
/**
 * Tests generated from: <script-name>.daml
 * 
 * Prerequisites:
 * 1. Start Canton ledger: `daml start`
 * 2. Setup script runs automatically via init-script in daml.yaml
 * 3. Set environment variables: USER_PARTY, OPERATOR_PARTY
 * 
 * Workflow: <brief description>
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { TemplateIds, Query } from '../<project-name>-api';
import type { ContractId } from '../core/primitives';
import { user, operator, userLedger, operatorLedger, configId } from './testSetup';

describe('<ScriptName> Workflow', () => {
  // Verify setup completed before running tests
  beforeAll(async () => {
    // Use Query helper with destructuring - never pass QuerySpec directly to ledger.query()
    const spec = Query.expectedContract({ /* filter */ });
    const setupContracts = await operatorLedger.query(spec.templateId, spec.filter);
    if (setupContracts.length === 0) {
      throw new Error('Setup contracts not found. Ensure `daml start` completed successfully.');
    }
  });

  test('complete workflow', async () => {
    // Query example with destructuring
    const { templateId, filter } = Query.someTemplate({ owner: user });
    const contracts = await userLedger.query(templateId, filter);

    // Use values from testSetup (configId, etc.) - never hardcode different values
  });
});
```

### Test File Structure (without Setup)

If no Setup.daml exists, tests are self-contained:

```typescript
/**
 * Tests generated from: <script-name>.daml
 * 
 * Prerequisites:
 * 1. Start Canton ledger: `daml start`
 * 2. Set environment variables: USER_PARTY, OPERATOR_PARTY
 * 
 * Workflow: <brief description>
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { TemplateIds, Query } from '../<project-name>-api';
import type { Party, ContractId } from '../core/primitives';
import { createLedgerClient, type CantonLedgerClient } from '../ledger';

const user = process.env.USER_PARTY as Party;
const operator = process.env.OPERATOR_PARTY as Party;

if (!user) {
  throw new Error('USER_PARTY environment variable required');
}

describe('<ScriptName> Workflow', () => {
  let userLedger: CantonLedgerClient;
  let operatorLedger: CantonLedgerClient;

  beforeAll(() => {
    userLedger = createLedgerClient(user);
    if (operator) operatorLedger = createLedgerClient(operator);
  });

  test('complete workflow', async () => {
    // Query contracts - ALWAYS destructure QuerySpec, never pass directly
    const { templateId, filter } = Query.someTemplate({ owner: user });
    const contracts = await userLedger.query(templateId, filter);

    // Each test creates its own data - fully independent
  });
});
```

---

## STEP 6: Create Vitest Configuration

If `sdk/vitest.config.ts` doesn't exist, create it:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/testSetup.ts'], // Only if testSetup.ts was created
    testTimeout: 30000,
    // Canton often hits LOCKED_CONTRACTS if multiple files mutate shared contracts in parallel.
    // Force files to run sequentially.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
```

**Note**: Only include `setupFiles` if `testSetup.ts` was generated from Setup.daml.

---

## STEP 7: Validate

Run TypeScript validation (do NOT run the tests):

```bash
cd <project-path>/sdk && npx tsc --noEmit
```

Fix any compilation errors.

---

## OUTPUT

Report when complete:
- Project name: `<project-name>`
- SDK path: `<project-path>/sdk`
- Setup file: `testSetup.ts` created ✅ / not needed (no Setup.daml)
- Daml scripts processed: (list each with brief description)
- Test files generated: (list each)
- TypeScript validation: ✅/❌

Then tell the user:

> To run the tests:
> 1. Start the Canton environment: `cd <project-path> && daml start`
> 2. In another terminal, run: `cd <project-path>/sdk && npx vitest run`
