# Pitfalls and fixes

Things PlantUML's activity-beta engine does badly when you give it the kind of diagram this skill produces, and the exact fix for each. Every entry has been verified against `plantuml -tpng -SdpiCommandLine=200` output in practice; the same issues appear in SVG output.

## 1. Fork bar invisible across swim lanes (the big one)

### Symptom

You write a `fork` whose branches end up in different lanes. Render the diagram. The arrow leaving the activity before `fork` appears to point at empty space. Likewise, the arrows from the branch tails seem to converge on nothing before the activity after `end fork`.

### Why it happens

PlantUML's maintainer made this design choice deliberately. When fork branches are in different lanes, the fork bar would have to span the lanes — and the maintainer judged that visually confusing, so the bar is rendered as a zero-width invisible node instead. The arrows DO connect topologically, but visually they appear orphaned.

Confirmed in [PlantUML Q&A — Fork vertex (bar) doesn't cross swimlane](https://forum.plantuml.net/2348/fork-vertex-bar-doesnt-cross-swimlane).

### Fix — sync anchor activities

Insert an explicit activity styled with a `.sync` class immediately **before** every `fork` and immediately **after** every `end fork`, both in the same coordinator lane:

```plantuml
|Coordinator|
:<color:white>**fork**</color>; <<sync>>
fork
  |Lane A|
  :Branch A step;
fork again
  |Lane B|
  :Branch B step;
end fork

|Coordinator|
:<color:white>**join**</color>; <<sync>>
:Continue;
```

The `.sync` class (defined in `styling.md`) renders the activity as a dark rectangle with white text, approximating a UML synchronization bar. The labels `fork` and `join` are conventional — replace with the actual coordinator action if it has a name (e.g., `**Coordinate allocations**`).

This is the most important pattern in this skill.

## 2. Multi-lane arrow jumps render as broken stubs

### Symptom

An arrow that has to cross three or more lanes — e.g., from `CompanyA UI` (column 1) directly to `Bank App Backend` (column 4) — renders as a series of disconnected horizontal segments with no clear path. The arrowhead may appear in the middle of nowhere.

### Why it happens

PlantUML's orthogonal router segments long cross-lane arrows. The segments compete for vertical space with other arrows and sometimes get drawn on top of unrelated activities, breaking the visual continuity.

### Fix — reorder lanes for adjacency

Place each actor's lanes next to each other in the lane declaration. The lane order for the validated DvP example is the canonical example:

```plantuml
|CompanyA-Bank UI|
|Bank App Backend|        ' next to its UI
|CompanyA-DvP UI|
|DvP App Backend|         ' coordinator, central
|CompanyB-DvP UI|
|CSD App Backend|         ' next to its UI
|CompanyB-CSD UI|
```

The flow now hops one lane at a time and the renderer keeps the arrows continuous.

If you cannot reorder (e.g., the user wants the lane order to match a specific reference image), the alternative is to use named connectors `(A)` / `(B)` to teleport across the diagram without drawing a long arrow. See `plantuml-syntax.md` for that syntax.

## 3. Partitions that span lanes get duplicated

### Symptom

You wrap a group of activities with `partition "Phase 1" { ... }` and some of those activities are in different lanes. The rendered output shows one `Phase 1` border per lane the partition touches.

### Why it happens

PlantUML partitions are scoped per lane internally, even though the syntax suggests otherwise.

### Fix

Do not use partitions across lanes. Two alternatives:

- Drop the partition and use a `note` to label the phase: `note over Lane1, Lane2 : Phase 1`.
- Refactor so the partition contents are all in one lane (often this means realizing the "phase" is really a coordinator activity).

## 4. Implicit lane order gives the wrong layout

### Symptom

Lanes appear in an unexpected left-to-right order. Arrows that you expected to flow left-to-right instead curl back on themselves.

### Why it happens

Without explicit declaration, lanes appear in first-mention order. If the first activity is in `CompanyB UI`, that becomes column 1, even if it makes no logical sense.

### Fix

Declare every lane before the first activity:

```plantuml
|Lane 1|
|Lane 2|
|Lane 3|
|Lane 4|

|Lane 2|     ' now switch to the lane where the flow starts
start
:First activity;
```

This is cheap insurance. Do it on every diagram, not just the ones you suspect.

## 5. Conjunctive choice rendered as a fork

### Symptom

You see an exercise that requires multiple controllers (`controller alice, bob`) and instinctively model it as a `fork` because "Alice and Bob are doing things in parallel".

### Why it is wrong

A conjunctive choice is a single atomic ledger exercise. Both controllers' authorization is required, but the exercise happens as one transaction — there is no parallelism. Modelling it as a fork suggests two paths that synchronize later, which misrepresents the Daml semantics.

### Fix

Render conjunctive choices as ONE activity. Put the joint controllers in the label or in a note:

```plantuml
:Exercise Transfer\non Card\n(jointly by Alice and Bob);
```

Or, if the diagram has lanes for Alice and Bob separately, put the activity in a coordinator lane and use a note to identify the controllers.

`fork` is reserved for genuine off-ledger parallelism — e.g., two backend services doing independent work before a final on-ledger step.

## 6. `bar` style block has no effect

### Symptom

You try to make fork bars visible by adding a `bar { ... }` rule in the `<style>` block. Nothing changes.

### Why it happens

The activity-beta engine does not expose fork/join bars as a styleable element. There is no documented style key for them.

### Fix

Use the sync-anchor workaround from pitfall #1. Do not waste time tweaking nonexistent `bar` / `synchronization` / `activitybar` style keys.

## 7. `start` renders hollow

### Symptom

The initial node is a hollow circle, not a filled black dot.

### Why it happens

Some pre-built themes override the `circle` style with an outline-only fill.

### Fix

Add an explicit `circle` rule in the `<style>` block:

```plantuml
circle {
  BackgroundColor #000000
  LineColor #000000
}
```

(This is already in the light theme in `styling.md` — only an issue if you start from a different theme.)

## 8. Long activity labels overflow

### Symptom

A two-line activity label gets one line cut off, or the activity box pushes adjacent activities sideways.

### Why it happens

PlantUML does not auto-wrap activity text. Long labels render as a single line up to a generous width, then get truncated or push the layout.

### Fix

Use explicit `\n` line breaks to control wrapping:

```plantuml
:Satisfy request by splitting out\n$10 from CompanyA's contract\nand mark as reserved;
```

Aim for three lines maximum. If you need more, the activity is doing too much — split it into two activities.
