# Styling

The default PlantUML look is dated. This file holds three themed `<style>` blocks — light (default), dark, and sketchy — plus the rationale for each rule so they can be adapted, not just copied.

## Why a custom `<style>` block, not a `!theme` directive

`!theme cerulean-outline` and friends produce decent results but hide several things this skill needs:

- The fork/join sync anchors require a `.sync` class (a stereotype style), and pre-built themes do not define one.
- Many themes alter the swim-lane separators in ways that fight against the lane-adjacency rule.
- Themes occasionally make the `start` circle outlined instead of filled, which conflicts with how the canton-course materials draw initial nodes.

Use a custom `<style>` block. Combine with `!theme` only if you understand exactly how the theme interacts with your overrides.

## Light theme — the default for this skill

This is the block to use unless the user asks for something else. It is the same block validated end-to-end against the DvP workflow:

```plantuml
<style>
activityDiagram {
  FontName Inter
  FontSize 13
  BackgroundColor #FFFFFF

  activity {
    BackgroundColor #FFFFFF
    LineColor #2C3E50
    LineThickness 1
    RoundCorner 6
    FontColor #1F2A36
    Padding 10
    Margin 10
  }
  arrow {
    LineColor #2C3E50
    LineThickness 1.2
    FontColor #4A5A6A
    FontSize 11
  }
  swimlane {
    LineColor #B8C4D1
    LineThickness 1
    FontColor #2C3E50
    FontStyle bold
  }
  circle {
    BackgroundColor #000000
    LineColor #000000
  }
  .sync {
    BackgroundColor #1F2A36
    LineColor #1F2A36
    FontColor #FFFFFF
    RoundCorner 3
  }
}
</style>
```

Rule-by-rule rationale:

- **`FontName Inter`** — a neutral modern sans-serif. Falls back gracefully to system sans-serif if Inter is not installed.
- **`activity` block** — white fill, dark slate border, 6px round corners give activities a card-like feel without being heavy. `Padding 10 Margin 10` keeps activities breathing room so labels do not crowd the box edges.
- **`arrow` block** — slightly thicker than default (1.2) so arrows stay legible at low DPI; muted gray font for arrow labels so they recede next to the activity names.
- **`swimlane`** — pale lavender-gray separator, bold dark label. Light enough not to compete with activities, dark enough to read as a column header.
- **`circle`** — pure black fill for `start` and `stop`. Without this rule, themes sometimes render `start` hollow, which looks like an error.
- **`.sync`** — the dark "synchronization bar" stereotype used by fork/join anchor activities (see `pitfalls-and-fixes.md`). Dark fill with white label distinguishes it visually from regular activities and approximates a UML fork bar.

## Dark theme

Use when the user asks for a dark-background diagram (e.g., embedding in a dark presentation deck):

```plantuml
<style>
activityDiagram {
  FontName Inter
  FontSize 13
  BackgroundColor #0F1419

  activity {
    BackgroundColor #1B2330
    LineColor #5C7080
    LineThickness 1
    RoundCorner 6
    FontColor #E8ECEF
    Padding 10
    Margin 10
  }
  arrow {
    LineColor #8A9BA8
    LineThickness 1.2
    FontColor #B4C0CC
    FontSize 11
  }
  swimlane {
    LineColor #2A3441
    LineThickness 1
    FontColor #B4C0CC
    FontStyle bold
  }
  circle {
    BackgroundColor #E8ECEF
    LineColor #E8ECEF
  }
  .sync {
    BackgroundColor #E8ECEF
    LineColor #E8ECEF
    FontColor #0F1419
    RoundCorner 3
  }
}
</style>
```

Inversion notes: `.sync` and `circle` flip to light fills so they still pop against the dark canvas.

## Sketchy / hand-drawn

When the user wants the Excalidraw-style informal look (e.g., for a brainstorm doc):

```plantuml
!theme sketchy-outline
<style>
activityDiagram {
  FontName "Comic Neue"
  FontSize 13
  .sync {
    BackgroundColor #2C3E50
    LineColor #2C3E50
    FontColor #FFFFFF
    RoundCorner 3
  }
}
</style>
```

`sketchy-outline` provides the rough-line look; the overlay only adds the `.sync` class because the bundled theme does not define one, and bumps the font.

## Per-element overrides

In addition to the block-level styling above, individual activities can be tinted inline. Use sparingly — overuse makes diagrams noisy:

- Error/abort step: `:Abort with insufficient funds; <<#FFE0E0>>`
- Success/highlight: `:Atomic swap complete; <<#E0F5E0>>`
- Off-ledger external call: `:Notify regulator; <<#FFF7E0>>`

Combine with line breaks and bold text inside the label:

```plantuml
:<color:#1F2A36>**Step 3.**</color>\nReserve security holding;
```

## Choosing between themes

| Context | Theme |
|---|---|
| Default, README, docs site | Light |
| Dark deck, dashboard embed | Dark |
| Brainstorm, design draft, blog | Sketchy |

When in doubt, pick light. It renders well in almost every context and the user can always ask for a variant.
