# agent-copy — copy data (human + AI) anywhere

A reusable primitive for putting **Copy** and **Copy for AI** actions on any
row, card, or page that shows data. It centralizes clipboard writes (with a
legacy `execCommand` fallback), success toasts, and the AI payload envelope so
no page reimplements them.

**Pieces:**
- `CopyButtons` — the two-button pair. `size`: `"xs"` (h-5, dense list items /
  metric cards / per-field), `"icon"` (h-7, rows/cards), `"sm"` (icon + text,
  headers). Stops click propagation by default (`stopPropagation={false}` to opt out).
- `buildAgentPayload` — the xml-ish envelope (live URL/route/timestamp + full
  JSON dump).
- `AgentCopyGroomerLauncher` + `AgentCopyGroomerWindow` (+ `groomer-types.ts`)
  — the **page-level** "Copy for AI": a WindowPanel where the user grooms the
  whole-page payload before copying. See "Whole-page copy" below.

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

Copy exists at EVERY level of granularity — individual field/entry, item, list,
record, page. **Never display data the user can't copy** (each part alone, and
the whole with context). Dense surfaces use hover-reveal `size="xs"` pairs
(`opacity-0 group-hover/x:opacity-100 focus-within:opacity-100`) so density
survives.

- **Lists/tables** (sandboxes, models, tasks…): per-row copy **and** a
  copy-all in the header. You want "this one" or "the whole list."
- **Metric cards / dimension list items**: hover-reveal `xs` pair per card and
  per item, plus a whole-list pair in the section header.
- **Detail/record pages & row windows**: a record-level pair in the header +
  per-field hover pairs (see MatrxDataTable integration below).
- **Whole page**: quick `CopyButtons` pair (human snapshot + full payload) AND
  an `AgentCopyGroomerLauncher` in the page header.
- **Don't overwhelm visually** — hover-reveal keeps ubiquity from becoming
  clutter. Skip surfaces with no meaningful record (pure tools, visualizers,
  demos).

## Built-in integrations (don't rewire by hand)

- **`MatrxDataTable`** — pass the `copy` config and you get per-row pairs, a
  toolbar this-view pair (markdown table + summaries), a record pair in the row
  window header (`DataRowWindow.headerActions`), and per-field hover pairs in
  `DataRowInspector` (side panel + window View tab). One config, five surfaces.
- **`DataRowInspector`** — per-field hover copy is ON by default
  (`fieldCopy={false}` to opt out); pass `recordKind`/`recordLabel`/`location`
  for correct payloads.
- **`JsonInspector`** — pass `agentCopy` (an `AgentPayloadInput` or builder) to
  add a Copy-for-AI button beside Copy JSON.

## Whole-page copy — the Groomer

The page header's `AgentCopyGroomerLauncher` opens `AgentCopyGroomerWindow`
(WindowPanel, loaded via `dynamic ssr:false` inside the launcher — never
static-import the window). The user grooms the payload before copying:

- **Sections** (`AgentCopyGroomerSection[]`): each page area declares
  `build(level)` for `full | compact | brief`, optional per-level labels, and
  `cuttable: true` when dropping it entirely is known-safe.
- **Presets**: Everything (all full) / Balanced (all compact) / Minimal (brief;
  cuttable → off), plus per-section dials.
- **Live size** per section and total (chars + ~tokens) and a live preview of
  the exact payload.

Pass `config` as a function — resolved at open, so sections capture the data on
screen. Reference wiring: `features/marketing/components/backlinks/BacklinksWorkspace.tsx`.

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
