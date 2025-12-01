---
description: Generate TypeScript API from Daml contracts - builds, generates bindings, creates clean API, and generates tests
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Generate Canton TypeScript API

Generate a clean, developer-friendly TypeScript API from Daml smart contracts.

---

## STEP 1: Discover Daml Projects

Look for Daml project configuration:

1. Check for `multi-package.yaml` in workspace root - if exists, parse to find all project paths
2. Check for `daml.yaml` in workspace root - single project setup
3. Check for `**/daml.yaml` - scan for projects in subdirectories

For each project found, extract:
- Project name (from `name:` field in daml.yaml)
- Project path
- SDK version

If **multiple projects** are found, use AskUserQuestion to ask the user:
> "Which Daml project should I generate the API for?"

Options should list all discovered project names.

---

## STEP 2: Build Daml Project

```bash
cd <project-path> && daml build
```

If build fails, report error and stop.

---

## STEP 3: Discover DAR Files

After successful build, find all DAR files needed for codegen:

1. Main project DAR: `<project-path>/.daml/dist/<project-name>-*.dar`
2. Dependencies in `.lib/`: `<project-path>/.lib/*.dar`

Build the codegen command dynamically with all discovered DARs.

---

## STEP 4: Generate JavaScript Bindings

Run daml codegen js with all discovered DAR files:

```bash
cd <project-path> && daml codegen js -o <sdk-path>/daml-js <all-dar-files>
```

Where:
- `<sdk-path>` defaults to `<project-path>/sdk` - the SDK output directory
- `<all-dar-files>` is the space-separated list of all DARs from Step 3

---

## STEP 5: Run Generator Script

Ensure the output directory has dependencies, then run the generator:

```bash
cd <sdk-path> && npm install && npx ts-node <repo-root>/.claude/commands/canton-sdk-generator/scripts/generate-canton-api.ts daml-js . <project-name>
```

Where:
- `<sdk-path>` defaults to `<project-path>/sdk`
- `<project-name>` is the name discovered in Step 1
- Output will be written to `<sdk-path>/`

---

## STEP 6: Validate TypeScript

```bash
cd <sdk-path> && npx tsc --noEmit
```

Fix any errors before proceeding.

---

## STEP 7: Enhance the Generated API

Read and apply the enhancement instructions from:
```
.claude/commands/canton-sdk-generator/prompts/enhance-api.md
```

Add the following to `<project-name>-api.ts`:
1. **Query namespace** - Helper functions for querying contracts
2. **TypeGuards** - Runtime type checking utilities
3. **MockFactories** - Testing utilities for creating mock data
4. **QueryKeys** - React Query cache key factories
5. **LedgerConnection** - Interface for ledger abstraction
6. **TestAssertions** - Type assertion utilities for tests

After adding enhancements, re-validate TypeScript.

---

## STEP 8: Generate Tests

Run the test generator to create explicit tests for the generated API:

```bash
cd <sdk-path> && npx ts-node <repo-root>/.claude/commands/canton-sdk-generator/scripts/generate-canton-tests.ts . <project-name>
```

This will:
1. Parse the generated `<project-name>-api.ts`
2. Discover all TemplateIds, workflows, TypeGuards, and MockFactories
3. Generate explicit test cases for each component
4. Create `__tests__/<project-name>-api.test.ts`
5. Create `vitest.config.ts` if it doesn't exist

---

## OUTPUT

Report when complete:
- Project name: `<project-name>`
- Project path: `<project-path>`
- SDK path: `<sdk-path>`
- DAR files processed: (list count)
- Templates found
- Workflows generated
- Interfaces extracted
- TypeScript validation: ✅/❌
- **Tests generated:** (count of test suites)
- **Run tests with:** `cd <sdk-path> && npx vitest run`
- Files created:
  - `<sdk-path>/core/primitives.ts`
  - `<sdk-path>/core/interfaces.ts`
  - `<sdk-path>/core/index.ts`
  - `<sdk-path>/<project-name>-api.ts`
  - `<sdk-path>/__tests__/<project-name>-api.test.ts`
  - `<sdk-path>/vitest.config.ts`
