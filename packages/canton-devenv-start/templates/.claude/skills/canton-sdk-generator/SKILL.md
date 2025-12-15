---
name: canton-sdk-generator
description: Generate TypeScript API from Daml smart contracts. Use when user mentions "generate canton SDK".
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

## STEP 5: Run API Generator (GENERATES ALL CODE)

The generator script produces ALL SDK code including:
- Core types (primitives, interfaces)
- Template IDs and type definitions
- Template namespaces (each with Payload, create(), and choice functions)
- Query helpers, TypeGuards, MockFactories
- Error classes and retry helpers
- Utils (amounts, ids, datetime, damlMap)

```bash
cd <sdk-path> && npx ts-node <path-to-skill>/scripts/generate-canton-api.ts daml-js . <project-name>
```

Where:
- `<path-to-skill>` is the absolute path to this skill's directory
- `<sdk-path>` defaults to `<project-path>/sdk`
- `<project-name>` is the name discovered in Step 1

---

## STEP 6: Validate TypeScript

```bash
cd <sdk-path> && npx tsc --noEmit
```

Fix any errors before proceeding.

---

## STEP 7: Generate React Layer (GENERATES ALL REACT CODE)

Run the React hooks generator:

```bash
cd <sdk-path> && npx ts-node <path-to-skill>/scripts/generate-canton-react.ts . <project-name>
```

Generates:
- `react/context/LedgerContext.tsx` - React context provider
- `react/context/useLedger.ts` - Context hook
- `react/hooks/core.ts` - Generic hooks (useContractQuery, useChoiceMutation)
- `react/hooks/queries.ts` - Typed query hooks for each template
- `react/hooks/mutations.ts` - Typed create + choice mutation hooks (action-first naming) and grouped actions per template
- `react/hooks/keys.ts` - Query key factories aligned with core query keys (so invalidation works)
- `react/index.ts` - Barrel export

---

## STEP 8: Validate & Document

Read `prompts/enhance-api.md` for validation checklist:
- Verify all templates have namespaces with Payload, create(), and choices
- Check TypeScript compiles with strict mode
- Create `docs/SDK.md` documentation (required)

This step validates generated code and creates user documentation.

### Debugging JSON API Auth (curl)

If you manually call the JSON API (e.g. with curl) and see:
`missing Authorization header with OAuth 2.0 Bearer Token`

Remember:
- The JSON API needs `Authorization: Bearer <JWT>`
- Unsigned sandbox JWTs must end with a trailing `.`
- Always quote the header string to avoid shell mangling

The generated SDK README includes a copy‑pasteable curl + token snippet.

---

## OUTPUT

Report when complete:
- Project name: `<project-name>`
- Project path: `<project-path>`
- SDK path: `<sdk-path>`
- DAR files processed: (list count)
- Templates discovered (by role: workflow/factory/asset/state)
- TypeScript validation: ✅/❌
- Documentation created: ✅/❌

---

## Next Steps

After SDK generation is complete, suggest:

> "SDK generated successfully! To generate integration tests, run the `canton-test-generator` skill."

The test generator will:
1. Look for DAML test scripts in `daml/Scripts/tests/`
2. Generate TypeScript tests that mirror the DAML workflows
3. Or generate basic template tests if no DAML scripts exist
