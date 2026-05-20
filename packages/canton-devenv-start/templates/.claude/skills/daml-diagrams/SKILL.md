---
name: daml-diagrams
description: Design and generate themed PlantUML activity diagrams for Daml workflows and choice flows. Use this skill whenever the user asks to diagram a Daml choice, visualize a multi-party workflow, draw swim lanes for parties or templates, render an exercise flow, or sketch a contract interaction — even if "PlantUML" is not named explicitly. Currently covers activity/workflow diagrams only; not yet transaction trees or contract lifecycle graphs.
---

# Daml Diagrams

Generate themed PlantUML activity diagrams that visualize Daml choices and multi-party workflows the way the canton-course teaches them: parties as swim lanes, choices as activities, consequences as the steps that follow, with a polished modern look.

## When this skill applies

- Diagramming a single Daml **choice** exercise and everything that follows from it.
- Visualizing a **multi-party workflow** (proposal/accept patterns, marketplace flows, DvP, KYC, etc.).
- Drawing **swim lanes** for parties, templates, or off-ledger services.
- Sketching an **exercise flow** or **contract interaction** where parties pass authority back and forth.

If the user says "draw a workflow", "diagram this choice", "visualize the swap", or "show me the flow" in a Daml/Canton context — even without naming PlantUML — this skill applies.

## When this skill does NOT apply (yet)

- **Transaction trees** (the per-transaction tree of subcalls inside a single exercise) — different shape, different conventions.
- **Contract lifecycle / state machine** diagrams.
- **ER-style template relationship** graphs.
- **Non-Daml workflows** (a general-purpose ops or web-app flow).

For those, do not force-fit this skill; recommend a different tool or note that a sibling skill would need to be built.

## The four-step workflow

### Step 1 — Identify scope

Decide which of two shapes you are drawing:

- **Choice flow** — start from one `Exercise <Choice> on <Template>` activity, then trace its consequences. Usually a tight diagram with one initial actor and 5–10 activities.
- **Workflow** — multiple choices chained across parties (e.g., the DvP swap example: propose → accept → parallel allocations → atomic swap). Wider, often parallel branches.

If the user's request is ambiguous (e.g., they name a choice but the surrounding workflow is large), ask which level of detail they want before drawing.

### Step 2 — Map Daml semantics to lanes and activities

Read `references/daml-to-diagram.md` and apply its mapping table. The headline rules:

- Each party becomes one or more swim lanes (UI / backend / on-ledger as separate lanes when those distinctions matter for the flow).
- Every `exercise` in the choice body becomes an activity labeled `Exercise <Choice>\non <Template>`.
- Every `create` / `archive` becomes its own activity.
- Conjunctive choices (multiple controllers acting jointly) render as **one** activity — they execute atomically, not in parallel. Never split a conjunctive choice into a `fork`.
- `fork` is reserved for genuine off-ledger parallelism (e.g., two backends doing independent work before a final on-ledger exercise).

### Step 3 — Compose the PlantUML

Copy `assets/template.puml` as the starting skeleton. It contains the themed `<style>` block, the lane-declaration prelude, and comment markers showing where to insert activities and fork/join anchors.

When parallel branches cross swim lanes, apply the **sync-anchor workaround** from `references/pitfalls-and-fixes.md`. PlantUML's fork bar deliberately does not cross swim lanes, so without the anchor the incoming arrow appears to point to nothing. The fix is a one-line styled anchor activity before `fork` and after `end fork`.

Two layout rules to follow without exception, because PlantUML's router quietly degrades when they are broken:

1. **Declare every lane up front, in the desired left-to-right order**, before the first activity. First-mention order is otherwise the default and the result is usually wrong.
2. **Place each actor's lanes adjacent to its counterparties.** If a UI redirects to its own backend, put those two lanes next to each other. If an arrow has to cross three or more lanes, the renderer draws disconnected stubs.

For full syntax details, read `references/plantuml-syntax.md`. For styling variants (dark theme, sketchy hand-drawn, minimal), read `references/styling.md`.

### Step 4 — Render and verify

Run the bundled render script:

```bash
~/.claude/skills/daml-diagrams/scripts/render.sh path/to/diagram.puml
```

It calls `plantuml -tpng -SdpiCommandLine=200` and writes the PNG next to the source. Pass `--open` to launch it in the default viewer. For vector output (embedding in HTML, scaling arbitrarily) pass `-t svg`.

Verify visually before reporting completion — use the Read tool on the output PNG to actually inspect the rendered diagram, do not just trust that it compiled:

- Every arrow lands on a visible box (no orphan stubs, no arrowheads pointing at empty space).
- The fork and join sync-anchor activities render as dark bars with white labels.
- Lane order matches the intended left-to-right reading.
- Activity text fits inside its box; long labels use `\n` line breaks.

If anything looks wrong, the first thing to check is lane adjacency (step 2 of the workflow) and whether a fork crossing lanes is missing its sync anchor.

## Output contract

- **When the user wants the raw diagram source** (e.g., to paste into a document, edit further, or commit), return only the `@startuml … @enduml` block, no prose around it.
- **When the user wants a finished artifact** (e.g., "render and show me"), generate the source, run `scripts/render.sh`, and report the output path. Include the source in a fenced block too, so they can iterate.
- **Never** emit Mermaid, D2, or draw.io XML in response to a request that triggered this skill — those are different tools with different visual languages.

## Worked example — DvP marketplace swap

Compact reference output for a two-party Delivery-versus-Payment workflow with parallel asset reservations. Use it as a style anchor, not a template to copy verbatim:

```plantuml
@startuml DvP-Workflow

<style>
activityDiagram {
  FontName Inter
  FontSize 13
  BackgroundColor #FFFFFF
  activity { BackgroundColor #FFFFFF LineColor #2C3E50 RoundCorner 6 FontColor #1F2A36 Padding 10 Margin 10 }
  arrow { LineColor #2C3E50 LineThickness 1.2 FontColor #4A5A6A FontSize 11 }
  swimlane { LineColor #B8C4D1 FontColor #2C3E50 FontStyle bold }
  circle { BackgroundColor #000000 LineColor #000000 }
  .sync { BackgroundColor #1F2A36 LineColor #1F2A36 FontColor #FFFFFF RoundCorner 3 }
}
</style>

|CompanyA-Bank UI|
|Bank App Backend|
|CompanyA-DvP UI|
|DvP App Backend|
|CompanyB-DvP UI|
|CSD App Backend|
|CompanyB-CSD UI|

|CompanyA-DvP UI|
start
:Exercise CreateDvPProposal\non DvPMarket;
|CompanyB-DvP UI|
:Exercise AcceptProposal\non DvPProposal;

|DvP App Backend|
:<color:white>**fork**</color>; <<sync>>
fork
  |CompanyA-DvP UI|
  :Request to allocate $10\nfor DvP in Bank App;
  -> redirect;
  |CompanyA-Bank UI|
  :Review and approve request;
  |Bank App Backend|
  :Exercise Reserve\non CashHolding;
fork again
  |CompanyB-DvP UI|
  :Request to allocate 1 asset for DvP;
  -> redirect;
  |CompanyB-CSD UI|
  :Review and approve request;
  |CSD App Backend|
  :Exercise Reserve\non SecurityHolding;
end fork

|DvP App Backend|
:<color:white>**join**</color>; <<sync>>
:Exercise AtomicSwap\non DvPProposal;
stop
@enduml
```

Note the seven-lane declaration up front (backends adjacent to their UIs), the `<<sync>>`-stereotyped fork and join anchors in the coordinator's lane, and the `Exercise <Choice>\non <Template>` activity labels.

## Reference files — when to read each

- **`references/daml-to-diagram.md`** — read every time, before composing the diagram. It maps the course's vocabulary (Decisions, Consequences, Authorization, Visibility, lifetime rule, design guidelines) to concrete diagram elements.
- **`references/plantuml-syntax.md`** — read when you need exact syntax for an element you have not used recently: conditionals, loops, nested forks, arrow styling, stereotypes, inline colors.
- **`references/styling.md`** — read when the user wants a non-default look (dark theme, sketchy, presentation-ready), or when you want to add an inline override.
- **`references/pitfalls-and-fixes.md`** — read when something does not render as expected, or whenever the flow crosses three or more lanes / forks across lanes. Contains the sync-anchor workaround and the lane-adjacency rule.

## A note on the course

The canton-course teaches workflows through the language of **Decisions, Actors, Authorization, Consequences, and Visibility**. Diagrams generated through this skill should use the same vocabulary so a learner reading the diagram recognizes the concepts immediately. The mapping reference is built around that vocabulary.
