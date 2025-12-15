---
name: canton-webapp-generator
description: Generate a React webapp for Canton ledger. Use when user mentions "generate webapp", "create webapp", or "build frontend".
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Generate Canton Webapp

Generate a React webapp that interfaces with a Canton ledger running Daml smart contracts.

**Tech Stack:** React 18, Vite, TanStack Query, React Router v6, Tailwind CSS

---

## CRITICAL: No Placeholders

**Every feature MUST be fully implemented.** Do not:

- Add TODO comments for future implementation
- Create placeholder components with "Coming soon" text
- Leave hooks returning mock data
- Skip error handling or loading states
- Add buttons that don't work

**Every component, hook, and feature you create must be complete and functional.** If a feature requires data from the Daml model, implement the actual query. If a button should exercise a choice, wire it up completely.

The generated scaffolding provides working base code. When customizing for the Daml model, maintain the same standard: **working code only, no placeholders.**

---

## Prerequisites

This skill requires a pre-generated SDK. Before running:

1. Check for SDK at `<project-path>/sdk`
2. If SDK doesn't exist, tell user: "Please run the canton-sdk-generator skill first to create the SDK."
3. Verify SDK has `<project-name>-api.ts` with `TemplateIds` export

---

## STEP 1: Discover Project

Look for Daml project configuration:

1. Check for `daml.yaml` in workspace - extract project name
2. Verify SDK exists at `<project-path>/sdk`
3. Parse SDK's `<project-name>-api.ts` to discover available templates

If SDK not found, stop and instruct user to generate SDK first.

---

## STEP 2: Generate Webapp Scaffolding

Run the webapp generator script:

```bash
cd <project-path> && npx ts-node <path-to-skill>/scripts/generate-webapp.ts <project-path> <project-name>
```

Where:
- `<path-to-skill>` is the absolute path to this skill's directory
- `<project-path>` is the Daml project root
- `<project-name>` is from `daml.yaml`

This creates `<project-path>/webapp/` with:
- Project config (package.json, vite.config.ts, tailwind.config.js, .env.example)
- Base UI components (Button, Card, Input, Modal, Select, Badge, Spinner)
- Layout components (MainLayout, Header, Sidebar)
- Core hooks (useAuth, useLedgerClient, useContractQuery, useAnyContracts)
- Base features (PartySelector, Dashboard, ContractList - all working!)
- App shell (main.tsx, App.tsx)
- Utility functions (getLedgerUrl, formatPartyId, formatAmount)

---

## STEP 3: Install Dependencies

```bash
cd <project-path>/webapp && npm install
```

---

## STEP 4: Customize for Daml Model

Read `prompts/customization.md` for detailed patterns, then:

### 4.1 Discover All Choices from SDK

**CRITICAL**: Read the SDK's `<project-name>-api.ts` and extract ALL available choices for each template. Look for:

```typescript
// In the SDK, each template namespace exports choice functions:
export namespace MyModule_MyTemplate {
  export interface Payload { ... }
  export function create(...): Command<Payload>;
  export function Accept(contractId: ContractId<Payload>): Command<...>;  // <- Choice
  export function Transfer(contractId: ContractId<Payload>, args: {...}): Command<...>;  // <- Choice
}
```

Every exported function (except `create`) is an exercisable choice. You MUST create hooks for ALL of them.

### 4.2 Create Domain Hooks

In `src/hooks/useContracts.ts`, create hooks for **each template AND each choice**:

```typescript
import { TemplateIds, MyTemplate } from '@sdk/<project-name>-api';
import { useContractQuery, useExerciseChoice } from './useLedger';

// Query hook for template
export function useMyContracts() {
  return useContractQuery<MyTemplate.Payload>(TemplateIds.MyModule_MyTemplate);
}

// Hook for EVERY choice discovered in SDK
export function useAcceptMyContract() {
  return useExerciseChoice(TemplateIds.MyModule_MyTemplate, 'Accept');
}

export function useTransferMyContract() {
  return useExerciseChoice(TemplateIds.MyModule_MyTemplate, 'Transfer');
}

// ... create a hook for EACH choice found in the SDK
```

### 4.3 Create Feature Components

For each major template, create in `src/features/`:
- `<TemplateName>List.tsx` - List view with query hook
- `<TemplateName>Detail.tsx` - Detail view with ALL choice actions from SDK
- `Create<TemplateName>.tsx` - Form to create new contracts

**Important**: The Detail view must include buttons for ALL choices discovered in the SDK, not just a subset.

### 4.4 Add Routes

Update `src/App.tsx` with routes for new features:

```typescript
<Route path="/my-contracts" element={<MyContractList />} />
<Route path="/my-contracts/:id" element={<MyContractDetail />} />
<Route path="/create-my-contract" element={<CreateMyContract />} />
```

### 4.5 Update Navigation

Add links to `src/components/layout/Sidebar.tsx` for new features.

---

## STEP 5: Validate

Start the development server:

```bash
cd <project-path>/webapp && npm run dev
```

Verify:
- [ ] App loads at http://localhost:3000
- [ ] Party selector accepts a party ID and navigates to dashboard
- [ ] Contract queries return data (if contracts exist)

---

## STEP 6: Role-Based Features (Optional)

If the Daml model has role-specific contracts (admin, operator, etc.):

1. Add role detection in `useAuth.tsx` by querying role-indicator contracts
2. Create role-specific routes in `src/features/admin/`
3. Add conditional navigation in Sidebar based on roles

---

## OUTPUT

Report when complete:
- Project name: `<project-name>`
- Webapp path: `<project-path>/webapp`
- SDK integration: ✅
- Dependencies installed: ✅/❌
- Dev server URL: http://localhost:3000
- Templates discovered: (list from SDK)
- Choices discovered per template: (list each template with its choices)
- Domain hooks created: (list query hooks AND choice hooks)
- Features implemented: (list each with functionality and which choices are wired)

### Completion Checklist

Before reporting success, verify ALL of the following:

- [ ] SDK was parsed to discover ALL templates and ALL choices
- [ ] Every template in SDK has a corresponding query hook in `useContracts.ts`
- [ ] Every choice in SDK has a corresponding exercise hook in `useContracts.ts`
- [ ] Every domain hook is used in at least one feature component
- [ ] Every feature component has working queries and mutations
- [ ] Contract detail views include buttons for ALL choices available on that template
- [ ] Navigation includes links to all implemented features
- [ ] No TODO comments or placeholder text remain in any file
- [ ] App runs without console errors when connected to ledger

