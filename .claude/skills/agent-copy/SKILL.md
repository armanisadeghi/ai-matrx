---
name: agent-copy
description: Add "Copy" + "Copy for AI" buttons to any surface that shows data (rows, cards, lists, detail/record pages) using the shared `components/agent-copy` primitive. Use when wiring copy actions onto a new admin or user page/feature, continuing the app-wide rollout, or extending the agent payload (screenshot, surfaces-registry context, page state). Triggers on `components/agent-copy/**`, `<CopyButtons>`, `buildAgentPayload`, or any task like "add copy buttons", "copy this row/list/record", "copy for AI/agent", "let the agent pick up this data". NOT for the live-chat message bar (that is `AssistantActionBar` / `messageActionRegistry`) or markdown content actions (that is the `rich-document-actions` skill).
---

# agent-copy — copy data (human + AI) anywhere

A reusable primitive for putting **Copy** (human-readable) and **Copy for AI**
(xml-ish agent payload) buttons on any row, card, list, or record. It is the
orchestration glue between raw page data and an AI agent: today it copies to the
clipboard so a human pastes into an agent; the end state (see Roadmap) is the
agent reading that context directly and acting on the page.

Source + full docs: [`components/agent-copy/README.md`](../../../components/agent-copy/README.md).

---

## 30-second mental model

- **`buildAgentPayload(input)`** — pure util. Wraps any data in an xml-ish block
  with `<context>` (auto-injected live `url`, `route`, `copied-at` + your
  `location`/`description`/`context`) and a `<data format="json">` FULL JSON
  dump. The raw dump is what keeps it future-proof — never hand-list fields for
  the agent flavor.
- **`<CopyButtons>`** — the UI. Renders the two buttons, owns clipboard (with
  legacy fallback) + success toasts + click-propagation stopping. You pass
  `human` (readable text) and `agent` (an `AgentPayloadInput`, a prebuilt
  string, or a builder fn) + a `label`. Sizes: `"xs"` (h-5 — dense items,
  metric cards, per-field), `"icon"` (h-7 — rows/cards), `"sm"` (icon + text —
  headers).
- **Copy exists at EVERY granularity** — field/entry, item, row, list, record,
  page. Never display data the user can't copy. Dense surfaces hide the pair
  until hover (`opacity-0 group-hover/x:opacity-100 focus-within:opacity-100`).
- **Three flavors where data is structured:** human, **JSON** (pass `json` to
  CopyButtons), and Copy-for-AI. Scalars skip JSON.
- **Copy-for-AI scales to its data — sometimes it's a MENU, not a button.**
  Small/bounded data → the plain CopyButtons pair. Medium → pass
  `aiVariants` to CopyButtons (or use **`AiCopyMenu`** directly): a dropdown
  with a focused/short variant + the auto "Everything" escape hatch (chevron
  iff dropdown). Massive/unbounded → add `aiCustom`: a custom-preview dialog
  (toggles/presets/sliders) with live char/byte/~token counts. Shortening
  logic lives in pure per-data builders, never in the chrome. Derive preset
  variants from an existing section list (Backlinks does
  `applyGroomerPreset` over its groomer sections — never a second list), and
  keep envelope `context` identical across variants: a short variant is lossy
  in data, never in ambient context. `MatrxDataTable` takes
  `copy.aiVariants`/`copy.aiCustom` for the toolbar view copy.
- **Every data surface offers EXPORT** (`ExportMenu` + `export.ts`): lists and
  tables get JSON + CSV downloads; pages get their data JSON. Copy without
  export is half the job.
- **Truncated lists must offer the rest** — a "top 8" with no show-all toggle
  is a defect; copy/export always cover ALL rows, not the visible slice.
- **`AgentCopyGroomerLauncher`** — the page-level "Copy for AI". Opens a
  WindowPanel where the user grooms the whole-page payload: sections with
  `full/compact/brief/off` dials, Everything/Balanced/Minimal presets, live
  size (chars + ~tokens), live preview. Full contract in the README.
- The **"Copy for AI" button is a deliberate seam**: when the surfaces-registry
  + tool-injection layer lands, it flips from "copy to clipboard" to "hand
  context + callable actions to the agent" and every existing callsite comes
  along for free. So keep `kind` slugs stable and `attributes` meaningful.

---

## How to wire a surface (the whole job)

```tsx
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

// per-row / per-card — compact icon pair:
<CopyButtons
  size="icon"
  label={`Sandbox ${row.sandbox_id}`}      // used in toast + tooltip
  human={() => summary(row)}               // page/feature-specific readable text
  agent={() => ({
    kind: "sandbox-instance",              // STABLE root xml tag/identifier
    location: "AI Matrx Admin — Sandbox Management",
    description: "A single sandbox instance row.",
    data: row,                             // full object → JSON dump
    summary: summary(row),                 // optional <summary> block
    attributes: { id: row.id, status: row.status },
  })}
/>

// whole-list / whole-page — icon + text, goes in the header/toolbar:
<CopyButtons
  size="sm"
  label="All sandboxes"
  human={() => list.map(summary).join("\n\n")}
  agent={() => ({ kind: "sandbox-instances", location, description,
                  data: list, attributes: { count: list.length },
                  context: { filter, total } })}
/>
```

Always pass `human`/`agent` as **functions** so URL/timestamp/data are captured
at click time, not render.

### Tables: use the built-in config, never hand-wire rows

`MatrxDataTable` takes a `copy` config (`rowKind`/`listKind`/`humanRow`/…) and
delivers ALL of: per-row copy+JSON+AI, toolbar this-view triple + ExportMenu
(JSON + CSV of the current view), a record pair in the row-window header, and
per-field hover pairs in `DataRowInspector` (side panel + window). Also pass
`window={{ title }}` so rows open the record window.
**Page already has its own header row above the table?** Set
`copy.showToolbar: false` and put the view copy + ExportMenu IN that row —
otherwise the table renders a near-empty toolbar row holding only copy icons
(the exact mess Arman flagged on backlinks). Table titles are user words
("Backlinks"), never internal ("Stored backlink rows"); counts are a subtle
muted `tabular-nums` beside the title, never a sentence pushing the search.
`JsonInspector` takes `agentCopy` for raw-JSON surfaces. Reference wiring for a
full page (cards + dimension lists + table + groomer):
`features/marketing/components/backlinks/BacklinksWorkspace.tsx`.

### Whole-page: quick pair + Groomer

Page header gets a quick `CopyButtons` pair (human snapshot + everything-level
payload) AND an `AgentCopyGroomerLauncher` whose sections mirror the page's
areas. Declare sections once and derive the quick payload from
`sections.build("full")` — never maintain two section lists.

### Step-by-step

1. **Find where the list actually renders.** Most `/administration/*` pages are
   thin wrappers (9–25 lines) that delegate to a feature component — the `.map()`
   lives in `features/*`, not the page. Wire it in the **feature component** so
   admin AND user surfaces both benefit. (Quick check: `wc -l` the page; <30
   lines ⇒ it's a wrapper, go find the component it renders.)
2. **Add a shared `human` summary** in the feature's `format.ts` (e.g.
   `lib/sandbox/format.ts`, `features/ai-models/format.ts`). Reuse it for both
   the row and the list. **Never duplicate** the summary across files.
3. **Per-row:** drop `<CopyButtons size="icon" …>` in the row's action cell.
4. **Whole-list:** drop `<CopyButtons size="sm" …>` in the toolbar/header,
   guarded by `list.length > 0`.
5. **Detail/record pages:** one `<CopyButtons size="sm">` in the header that
   copies the whole record — the live URL + full state here is the highest-value
   capture.
6. Set a stable `kind`, a clear `location` (include the route), and useful
   `attributes`/`context`.
7. `pnpm exec tsc --noEmit` the touched files; commit per page/component.

---

## Module-audit protocol — sweep a feature BEFORE wiring

When assigned a whole feature/module (not one page), do the coverage audit
first and emit the gap list; only then wire, batch by batch:

1. **Enumerate surfaces.** Routes (`app/**` for the feature — remember thin
   wrappers delegate to `features/*`), window panels, overlays/dialogs that
   show data, and demo routes. The feature's `/[feature]/admin` map and
   FEATURE.md are the fast index; `grep` for `.map(` in its components to
   find every rendered list.
2. **Classify each rendered data element** as one of: **list/table** (needs
   row pair + view copy + ExportMenu), **record/detail** (header pair +
   per-field), **field group / metric cards** (hover-reveal `xs` pairs),
   **whole page** (quick pair + Groomer when multi-section), or **non-record
   tool** (composer/visualizer — SKIP, no forced buttons).
3. **Size each one's AI control** (single icon / `aiVariants` dropdown /
   `+aiCustom` preview) per the sized-to-data table above, and note truncated
   lists that lack a show-all — those are defects, list them.
4. **Emit the coverage table** (surface → element → class → current state →
   planned control) in your summary/handoff BEFORE writing code, then wire in
   per-page commits using the step-by-step below.

## Pitfalls (these will bite you)

- **Clickable rows:** if the `<tr>`/row has an `onClick` (navigate/select),
  wrap `<CopyButtons>` in `<span onClick={(e) => e.stopPropagation()}>` (or put
  it in a cell that already stops propagation) so copying doesn't also
  select/navigate. See `AiModelTable` RowActions and the invitation-requests
  cell for the pattern.
- **Don't reinvent the envelope.** The agent flavor is `buildAgentPayload` only.
  Don't hand-roll xml or a JSON dump at the callsite (that anti-pattern is what
  this primitive replaced on the admin sandbox page).
- **Skip non-record surfaces.** Tools/composers/visualizers (email composer, SQL
  workbench, schema visualizer, markdown tester, component demos) have no
  copyable record — don't force buttons there. Copy belongs on lists & records.
- **Don't overwhelm.** Favor per-row + copy-all on lists; a single whole-record
  copy on detail pages. More than that clutters.
- **`size="icon"` is h-7 w-7;** if a row uses denser actions (h-6) it'll be a
  hair larger — acceptable, don't fight it with overrides.

---

## Rollout status (update this as you go)

**Done:**
- Primitive + README + roadmap (`components/agent-copy/`), `xs` size, groomer
  window (`AgentCopyGroomerWindow` + launcher + `groomer-types.ts`).
- Graded Copy-for-AI variants: `AiCopyMenu`, `CopyButtons.aiVariants`,
  `CopyButtons.aiCustom`, `MatrxDataTable copy.aiVariants/aiCustom`, shared
  `clipboard.ts`, plus `buildGroomerPresetPayload` /
  `groomerPresetVariants` (groomer-types) and `keyFieldsAiVariant`
  (marketing `copy-payloads.ts`). Wired on the medium/massive marketing site
  tabs (keywords, ranks, findings, analysis, audit, links, crawls, discovery,
  cost + backlinks reference); small bounded tabs deliberately keep the plain
  pair — the sized-to-data call is part of the job. `AiCopyMenu` remains in
  step with aidream `apps/dashboard/src/components/agent-copy/AiCopyMenu.tsx`.
- Graded variants wired on the medium/massive marketing site tabs (keywords,
  ranks, findings, analysis, audit, links, crawls, discovery, cost +
  backlinks reference) via `buildGroomerPresetPayload` /
  `groomerPresetVariants` (groomer-types) and `keyFieldsAiVariant` (marketing
  `copy-payloads.ts`); small bounded tabs deliberately keep the plain pair —
  the sized-to-data call is part of the job.
- Built-in integrations: `MatrxDataTable` `copy` config → row/view/window/field
  pairs; `DataRowInspector` per-field hover copy; `JsonInspector` `agentCopy`.
- Shared formatters: `lib/sandbox/format.ts`, `features/ai-models/format.ts`,
  `features/marketing/components/backlinks/format.ts`.
- Pages: sandbox admin / user-list / detail; `administration/admins` (admins +
  audit); `administration/ai-tasks`; `administration/invitation-requests`;
  `/marketing/brands/[id]/sites/[id]/backlinks` (the full-granularity + groomer
  reference page).
- Feature component: `features/ai-models` (AiModelTable rows + AiModelFilterBar
  toolbar).
- `features/tool-registry/mcp-admin` (`McpServersAdminPage`: sidebar/detail/
  tools/configs/connections/meta) + `mcp-tools` (McpToolsManager catalog with
  the aiCustom export dialog, ToolViewPage record; shared
  `mcp-tools/format.ts`, sanitized — no endpoint URLs/OAuth ids).
- `feedback` → all four tabs of FeedbackManagementContainer + detail dialog
  (Copy-All extracted to shared `feedback/format.ts`; CategoriesTab's
  clickable `<button>` rows get sibling-overlay pairs).
- `system-agents/*`: AgentViewContent (bespoke SystemAgentCopyForAiMenu
  deleted — its modes are now `aiVariants`), roster grid, shortcuts list +
  directory, apps table, content blocks (metadata-only variant), lineage.
  Shared `features/agents/format.ts` + `features/agent-shortcuts/format.ts`.
- `agent-apps/*`: user grid + cards, overview record, versions + snapshot,
  admin table (aiCustom), executions/errors, rate-limits, analytics,
  categories, dashboard (fixed `.slice(0,6)` truncation with show-all).
  Shared `features/agent-apps/format.ts` (also de-duped formatNumber/
  formatDateTime).

**Remaining high-value feature components** (each its own batch — trace the
component, wire row + toolbar, typecheck, commit): none queued — pick the
next module via the route tree and repeat the audit → classify → wire loop.

---

## Roadmap — from "copy" to "connect"

The full vision lives in [`components/agent-copy/README.md`](../../../components/agent-copy/README.md):
page-level state capture, integration with the **surfaces registry**
(`features/surfaces/`, see the `surface-authoring` skill), automatic screenshots
(`hooks/useScreenCapture.ts`), and **dynamic tool injection** (register a page's
state + callbacks so an agent can call them with args). Keep `kind`/`attributes`
stable now so they become the tool vocabulary later.
