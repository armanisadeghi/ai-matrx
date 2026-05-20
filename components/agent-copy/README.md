# agent-copy — copy data (human + AI) anywhere

A reusable primitive for putting **Copy** and **Copy for AI** actions on any
row, card, or page that shows data. It centralizes clipboard writes (with a
legacy `execCommand` fallback), success toasts, and the AI payload envelope so
no page reimplements them.

> Forward-looking: the **Copy for AI** button is the seam where these become
> "connect this data to an agent" actions. The infrastructure already exists in
> `features/surfaces/` (surface manifests) and `hooks/useScreenCapture.ts`
> (screenshots); the `context` / `attributes` slots on `AgentPayloadInput` are
> where a surface manifest's runtime values or a screenshot reference thread in
> later — without changing any callsite.

## Usage

```tsx
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

// Per-row / per-card (compact icon pair):
<CopyButtons
  size="icon"
  label={`Sandbox ${row.sandbox_id}`}
  human={() => humanSummary(row)}          // page-specific readable text
  agent={() => ({
    kind: "sandbox-instance",              // root xml tag
    location: "AI Matrx Admin — Sandbox Management",
    description: "A single sandbox instance row.",
    data: row,                              // full object → dumped as JSON
    summary: humanSummary(row),             // optional <summary> block
    attributes: { id: row.id, status: row.status },   // root tag attrs
  })}
/>

// Whole-page / whole-list (icon + text, in the header):
<CopyButtons
  size="sm"
  label="All sandboxes"
  human={() => list.map(humanSummary).join("\n\n")}
  agent={() => ({
    kind: "sandbox-instances",
    location: "...",
    description: "All sandbox instances currently listed.",
    data: list,
    attributes: { count: list.length },
    context: { filter, total },            // extra <context> entries
  })}
/>
```

`buildAgentPayload` (called for you by `CopyButtons`) auto-injects the live
`url`, `route`, and `copied-at` timestamp into the `<context>` block — the
single most useful thing for an agent picking up the data.

Pass `human`/`agent` as **functions** so the URL/timestamp/data are captured at
click time, not render time.

## Placement guidance

It depends on the surface — favor granular AND big-picture where both add value:

- **Lists/tables** (sandboxes, models, tasks…): per-row copy **and** a
  copy-all in the header. You want "this one" or "the whole list."
- **Detail/record pages**: a single copy in the header for the whole record —
  the live URL + full state here is the highest-value capture.
- **Don't overwhelm**: skip surfaces where there's no meaningful record (pure
  tools, visualizers, demos, editors whose state isn't a copyable record).

## Rollout checklist for a new page

1. Identify the record/list the page shows.
2. Add a `human` summary (reuse a shared formatter if one exists — e.g.
   `lib/sandbox/format.ts`; don't duplicate).
3. Drop `<CopyButtons size="icon" …>` on each row and/or
   `<CopyButtons size="sm" …>` in the header for the whole set.
4. Set a stable `kind`, a clear `location`, and useful `attributes`/`context`.
