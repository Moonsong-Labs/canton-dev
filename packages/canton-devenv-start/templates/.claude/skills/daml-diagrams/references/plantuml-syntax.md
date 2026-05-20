# PlantUML Activity-Beta Syntax

This is the reference cheat sheet for PlantUML's modern activity diagram syntax (the `activitydiagram3` engine, often called "beta"). Use this and only this — never the legacy `(*)` / `-->` syntax, which is deprecated and renders differently.

## Skeleton

```plantuml
@startuml DiagramName
<style>...</style>

|Lane A|
|Lane B|

|Lane A|
start
:Activity in Lane A;
|Lane B|
:Activity in Lane B;
stop
@enduml
```

- `start` produces a filled black circle (initial node).
- `stop` produces a bullseye (final node). `end` also works but renders as a plain filled circle, not a bullseye — prefer `stop` for activity finals.
- `:text;` is an activity (rounded rectangle).
- `|Lane Name|` switches the lane that subsequent activities belong to.

## Swim lanes

```plantuml
|Lane 1|
|#AntiqueWhite|Lane 2|
|Lane 3|
```

- Declare every lane you intend to use at the top of the diagram, in left-to-right order. Lane order otherwise follows first-mention, which produces wrong layouts.
- Add a background tint with `|#hexcolor|Name|`.
- Switch lanes by writing the lane header again before an activity.

## Parallel branches — fork / fork again / end fork

```plantuml
fork
  :Branch A step 1;
  :Branch A step 2;
fork again
  :Branch B step 1;
end fork
```

Variants of the closing keyword:

- `end fork` — implicit AND-join (default).
- `end fork {and}` — explicit AND-join.
- `end fork {or}` — OR-join.
- `end merge` — merge without synchronization.

For three or more parallel branches, repeat `fork again`.

**Crucial:** when fork branches cross swim lanes, the fork bar collapses to an invisible node and arrows appear orphaned. See `pitfalls-and-fixes.md` for the sync-anchor workaround.

## Alternative split — split / split again

```plantuml
split
  :Path A;
split again
  :Path B;
end split
```

Use `split` instead of `fork` when the branches do NOT need to synchronize — for instance, two terminal paths where each ends in its own `stop`.

## Conditionals

```plantuml
if (condition?) then (yes)
  :Yes branch;
else (no)
  :No branch;
endif
```

- The `(yes)` / `(no)` parenthesized labels become the arrow labels on each branch.
- Multi-way branching uses `elseif`:

```plantuml
if (a?) then (yes)
  :A;
elseif (b?) then (yes)
  :B;
else (no)
  :C;
endif
```

## Loops

Repeat-until (test at the bottom):

```plantuml
repeat
  :Do work;
repeat while (more?) is (yes) not (done)
```

While (test at the top):

```plantuml
while (more data?) is (yes)
  :Process item;
endwhile (no)
:After loop;
```

## Arrow labels

The arrow `->` syntax labels the next arrow:

```plantuml
:Activity A;
-> on success;
:Activity B;
```

Without the arrow line, transitions are unlabeled.

Colored or dashed arrows:

```plantuml
-[#red]-> error path;
-[#33668E,dashed]-> async callback;
-[thickness=2]-> emphasized;
```

## Stereotypes (style classes)

Apply a named style to a single activity:

```plantuml
:Critical step; <<important>>
```

Combine with a `<style>` block:

```plantuml
<style>
.important {
  BackgroundColor #FFE0E0
  LineColor #C00000
}
</style>
```

This is how the `<<sync>>` anchors in the worked example get their dark look.

## Inline color overrides

For one-off coloring without defining a class:

```plantuml
:Activity; <<#palegreen>>
:Activity; <<#HotPink>>
:Activity with gradient; <<#blue\green>>
```

Inline text colors:

```plantuml
:<color:white>**Bold white**</color> on dark fill;
:<color:#C00000>Red text</color>;
```

Inline formatting also accepts `**bold**`, `//italic//`, `__underline__`, `\n` for line breaks.

## Notes

```plantuml
:Activity;
note right: A short remark.
note left
This note can
span multiple lines.
end note
```

`note right` / `note left` / `note over` / floating `note "text" as N1`.

## Partitions and groups

```plantuml
partition "Phase 1" {
  :Step A;
  :Step B;
}
```

Partitions render as labeled boxes around a sequence of activities. Avoid them when the sequence crosses swim lanes — PlantUML duplicates the partition per lane (see `pitfalls-and-fixes.md`).

`group` works like `partition` without a visible border by default.

## Connectors

Named connectors let you jump across the diagram without drawing a long arrow:

```plantuml
:Activity A;
(A)
detach

' ...later in the file...
(A)
:Activity B;
```

Useful when otherwise you would draw an arrow that crosses many lanes. `detach` ends the current path without drawing the outgoing arrow.

## Early termination

- `stop` — bullseye final node, ends the flow at this branch.
- `end` — plain filled circle; use `stop` instead unless you specifically want a non-final terminator.
- `kill` — hard stop with no outgoing arrow, often used in error branches.
- `detach` — drop the outgoing arrow; the current path simply ends without a terminator.

```plantuml
if (error?) then (yes)
  :Log and abort; <<#FFE0E0>>
  kill
endif
:Continue;
```

## Themes

A theme is a one-line directive after `@startuml` that swaps default colors and fonts:

```plantuml
!theme cerulean-outline
!theme bluegray
!theme materia-outline
!theme plain
!theme sketchy-outline
```

Themes work, but a custom `<style>` block (see `styling.md`) gives you finer control and is what this skill recommends by default.

## What NOT to do

- Do **not** use the legacy syntax: `(*) --> "First action"` etc. Different engine, ugly defaults, different bugs.
- Do **not** mix `skinparam` and `<style>` in the same file. Pick one. `<style>` is more powerful and is where PlantUML is heading.
- Do **not** rely on the `bar` element name in `<style>` — PlantUML's beta engine ignores it. Sync-anchor activities are the supported workaround.
