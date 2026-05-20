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

---

## Roadmap — from "copy" to "connect"

These buttons are a stepping stone. Today they copy data to the clipboard so a
human can paste it into an agent; the end state is the agent reading that
context directly and **acting** on the page. The pieces below already exist in
the repo in some form — this is the glue plan to wire them together.

### 1. Page-level state capture (near-term)

`buildAgentPayload` already injects the live `url` + `route`. Extend the
`context`/`data` on record/detail pages to include the page's primary state
(active record, filters, selection). The live URL + full state is the
single most valuable thing to hand an agent — "the user is HERE looking at
THIS." Prefer this over per-field copying on detail pages.

### 2. Surfaces-registry integration (`features/surfaces/`)

There is already a registry of **surface manifests** (`features/surfaces/`,
21+ surfaces) declaring the named runtime values each surface can supply, plus
a Redux registry (`features/agents/redux/surfaces/`) tracking which surfaces are
mounted. `buildAgentPayload` should learn to look up the active surface and
fold its declared values into `<context>` automatically, so a page gets rich
agent context without hand-listing fields at the callsite.

### 3. Automatic screenshot (`hooks/useScreenCapture.ts`)

`useScreenCapture` can grab a silent `html-to-image` PNG of the current tab. A
"Copy for AI + screenshot" variant (or a flag on `CopyButtons`) would attach a
screenshot reference/data URL to the payload so the agent sees the literal
pixels alongside the structured data. Our AI backend handles images, so this is
high-leverage for "what is the user looking at."

### 4. Dynamic tool injection — the big one

Imagine a page declares, in a registry: (a) its current state (including the
relevant Redux slices — the mother of all state) and (b) the set of callbacks
it can perform ("create sandbox", "stop instance", "promote admin", … ~15
actions per page) with their argument schemas. We then tell an agent: *here is
where the user is, here is everything you can see, and here is everything you
can do — call any of these with these args.* The agent becomes a real
co-pilot on the page, not just a reader.

The "Copy for AI" button is deliberately the seam for this: when the registry +
tool-injection layer lands, that button (or a sibling) flips from
"copy context to clipboard" to "hand context **and callable actions** to the
agent" — and every callsite that already uses `<CopyButtons>` comes along for
free. Keep `kind` slugs stable and `attributes` meaningful now; they become the
tool/identifier vocabulary later.

### Open ideas

- A keyboard shortcut (e.g. ⌘⇧C) to copy the active surface's agent payload
  from anywhere.
- A "copy-for-agent" action registered in the `features/rich-document` action
  registry so markdown/content surfaces get it too.
- A debug overlay that previews exactly what an agent would receive for the
  current page.
