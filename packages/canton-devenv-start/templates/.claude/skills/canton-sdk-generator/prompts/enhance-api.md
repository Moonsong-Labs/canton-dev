# Canton SDK Validation Checklist

This prompt validates the generated SDK. Scripts generate ALL code; this checklist verifies completeness.

---

## 1. Verify Generated Structure

Check that all directories and files were created:

- [ ] `core/primitives.ts` - exports Canton types (Party, ContractId, Time, Numeric)
- [ ] `core/interfaces.ts` - exports financial interfaces (Keys, Quantity, Lock)
- [ ] `core/index.ts` - re-exports all core types
- [ ] `ledger/config.ts` - exports LedgerConfig interface
- [ ] `ledger/client.ts` - exports CantonLedgerClient class
- [ ] `ledger/errors.ts` - exports LedgerError hierarchy
- [ ] `ledger/retry.ts` - exports withRetry and createRetryClient helpers
- [ ] `ledger/streaming.ts` - exports LedgerStream class
- [ ] `ledger/index.ts` - re-exports all ledger components
- [ ] `utils/amounts.ts` - exports amount utilities
- [ ] `utils/ids.ts` - exports ID/key factory functions
- [ ] `utils/datetime.ts` - exports date/time helpers
- [ ] `utils/damlMap.ts` - exports helpers for Daml `Map<K, V>` (array-of-pairs)
- [ ] `utils/index.ts` - re-exports all utils

---

## 2. Verify Template Coverage

Check that template discovery worked correctly:

- [ ] All templates from `daml-js/` have entries in `TemplateIds`
- [ ] Template roles correctly classified (workflow/factory/asset/state)
- [ ] **All templates** have a namespace with:
  - `Payload` interface (template fields)
  - `create()` function
  - One function per choice (except Archive)
- [ ] No templates missing from the generated API

---

## 3. Verify React Hooks (if generated)

Check `react/` directory:

- [ ] `react/context/LedgerContext.tsx` - exports CantonProvider
- [ ] `react/context/useLedger.ts` - exports useLedger hook
- [ ] `react/hooks/core.ts` - exports useContractQuery, useChoiceMutation
- [ ] `react/hooks/queries.ts` - exports typed query hooks (use{Entity}s)
- [ ] `react/hooks/mutations.ts` - exports create + choice mutation hooks (useCreate{Entity}, use{Verb}{Entity}) and grouped actions (use{Entity}Actions)
- [ ] `react/hooks/keys.ts` - exports queryKeys factories aligned with core query keys (so invalidation works)
- [ ] `react/index.ts` - barrel export with all hooks

---

## 4. TypeScript Validation

Run strict TypeScript check:

```bash
npx tsc --noEmit --strict
```

If errors occur:
1. Fix import paths (ensure relative paths are correct)
2. Fix type mismatches in generated code
3. Add missing type exports if referenced

---

## 5. API Quality Check

Verify the main `<project>-api.ts`:

- [ ] `TemplateIds` object contains all discovered templates
- [ ] Each template has its own namespace with `Payload`, `create()`, and choice functions
- [ ] `Query` namespace exists with typed query helpers for each template
- [ ] `TypeGuards` namespace exists with guards for each template
- [ ] `MockFactories` object exists with factory functions for testing
- [ ] No duplicate type exports
- [ ] No circular imports

---

## 6. Create Documentation

Generate `docs/SDK.md` with complete, direct documentation. No fluff. Structure:

### Required Sections

**1. Quick Start**
- Install dependencies
- Configure environment (LEDGER_HOST, LEDGER_PORT, TEST_PARTY)
- Create ledger client
- First contract creation example

**2. Templates Reference**
For EACH template namespace discovered, document:
- Namespace name and template ID
- `Payload` interface with all fields and their types
- `create()` function with example
- Each choice function with example
- Use actual field names and types from the generated code

**3. Queries**
- How to use `Query.<templateName>()` helpers
- Filtering examples with actual Payload fields

**4. Error Handling**
- LedgerError types
- How to use `isLedgerError()` and `withRetry()`

**5. React Integration** (if react/ was generated)
- CantonProvider setup
- Available hooks with examples

### Documentation Rules
- Every code example must be copy-pasteable
- Use actual template names from the project
- Reference actual field names and types
- No placeholder text — use real values from generated code
- Keep explanations to one sentence max

Write the documentation to `<sdk-path>/docs/SDK.md`.

---

## Validation Complete

When all checks pass:
1. Build check: `npx tsc --noEmit`
2. Documentation created: `docs/SDK.md`
3. Report success with template counts by role
