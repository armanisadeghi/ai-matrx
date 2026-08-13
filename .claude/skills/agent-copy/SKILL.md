---
name: agent-copy
description: Add "Copy" + "Copy for AI" buttons to any surface that shows data (rows, cards, lists, detail/record pages) using the shared `components/agent-copy` primitive — and build the payloads as WHAT THE USER SEES (rendered view, live form state, errors, KPIs), sized to the data (single pair / variants dropdown / custom composer). Use when wiring copy actions onto a new admin or user page/feature, continuing the app-wide rollout, reviewing or upgrading an existing Copy-for-AI payload, or extending the agent payload (screenshot, surfaces-registry context, page state). Triggers on `components/agent-copy/**`, `CopyButtons`, `AiCopyMenu`, `buildAgentPayload`, or any task like "add copy buttons", "copy this row/list/record", "copy for AI/agent", "let the agent pick up this data". NOT for the live-chat message bar (that is `AssistantActionBar` / `messageActionRegistry`) or markdown content actions (that is the `rich-document-actions` skill).
---

# agent-copy — copy data (human + AI) anywhere

A reusable primitive for putting **Copy** (human-readable) and **Copy for AI**
(xml-ish agent payload) buttons on any row, card, list, or record. It is the
orchestration glue between raw page data and an AI agent: today it copies to the
clipboard so a human pastes into an agent; the end state (see Roadmap) is the
agent reading that context directly and acting on the page.

Source + full docs: [`components/agent-copy/README.md`](../../../components/agent-copy/README.md).
**Sibling skill (doctrine twin):** aidream
`/Users/armanisadeghi/code/aidream/.claude/skills/copy-for-ai/SKILL.md` — its
cx-explorer implementation is the platform's best-of-breed reference; keep the
two skills and the two `AiCopyMenu`s in step.

---

## 🚨 THE MISSION — a Copy-for-AI is an AI context source, not a copy button

The user clicks it because they are **getting AI help with what they are doing
right now**. Before writing any payload, answer: *"what is the user doing on
this page the moment they click this?"* — then hand the agent exactly that.

- **THE WHAT-I-SEE LAW (Arman, 2026-08-12, in anger):** the PRIMARY payload is
  the **rendered surface converted to data** — never a raw record/snapshot
  dump. A payload that dumps 50k chars of adjacent data while missing the red
  error the user is staring at is a defect, not a copy button.
- **Errors first.** Blockers, warnings, red validation text — the exact
  sentences rendered — are the highest-value content. Capture them verbatim.
- **Mirror the page's leading KPIs.** If the page opens with a metric strip
  ("5 blockers · 3 own access · 1 nested"), every payload from that page —
  including section/panel payloads — carries those same numbers, verbatim, in
  the body AND the envelope `attributes`. Nothing on the page is interpretable
  without what the page leads with, and the agent must never recompute what
  the user already sees.
- **LIVE state, never saved rows.** Build the payload inside the click handler
  from current inputs/drafts. A form-heavy page's form values ARE the payload;
  copying the fetched row after the user edited a field is lying to the agent.
  Include an explicit `unsaved_changes` diff vs the saved record. (Broke twice
  on 2026-08-12 alone: access planner, agent-settings.)
- **Mirror the content extractor.** Reuse the view's own formatter/extractor so
  the export is what the user actually sees, not a parallel re-derivation.
- **A section payload states what it belongs to.** Specifics are only valid
  with their parent context (record identity + the page's KPIs) in the
  envelope.
- **The acceptance test:** put your payload beside a screenshot. Could an agent
  reconstruct what the user sees — every error, every KPI, the current form
  values? If not, it fails. Run this before reporting done.

## 30-second mechanics

- **`buildAgentPayload(input)`** — pure util. Wraps any data in an xml-ish block
  with `<context>` (auto-injected live `url`, `route`, `copied-at` + your
  `location`/`description`/`context`) and a `<data format="json">` body.
  `attributes` carry counts (`rows`, `blockers`, `total_messages`) — the
  payload self-describes so a future agent can decide what to fetch.
- **`<CopyButtons>`** — the UI. Renders the buttons, owns clipboard (with
  legacy fallback) + success toasts + click-propagation stopping. You pass
  `human` (readable text) and `agent` (an `AgentPayloadInput`, a prebuilt
  string, or a builder fn) + a `label`. Sizes: `"xs"` (h-5 — dense items,
  metric cards, per-field), `"icon"` (h-7 — rows/cards), `"sm"` (icon + text —
  headers). Pass `human`/`agent` as **functions** — resolved at click time.
- **Copy exists at EVERY granularity** — field/entry, item, row, list, record,
  page. Never display data the user can't copy. Dense surfaces hide the pair
  until hover (`opacity-0 group-hover/x:opacity-100 focus-within:opacity-100`).
- **Three flavors where data is structured:** human, **JSON** (pass `json` to
  CopyButtons), and Copy-for-AI. Scalars skip JSON. JSON/download is the
  raw-data affordance; Copy-for-AI is NEVER just the JSON in an envelope.
- **Every data surface offers EXPORT** (`ExportMenu` + `export.ts`): lists and
  tables get JSON + CSV downloads; pages get their data JSON. Copy without
  export is half the job.
- **Truncated lists must offer the rest** — a "top 8" with no show-all toggle
  is a defect; copy/export always cover ALL rows, not the visible slice.

## Sized to data — most Copy-for-AI controls are DROPDOWNS

It is impossible to guess what the user wants to share when there is real
data. Judge the size class for EVERY surface — a judgment call about the
page's usage, never a global rule:

| Data | Control | Menu contents |
|---|---|---|
| **Small / bounded** (one record, short list) | plain CopyButtons pair | just the faithful payload |
| **Medium** (focused list, digestible page) | `aiVariants` dropdown | 2–5 shaped variants + Everything |
| **Massive** (can reach ~10k+ chars: conversations, big tables, multi-section pages) | dropdown + **custom composer dialog** (`aiCustom`) | variants + Everything + tunable custom |

- **A single button on a payload that can reach ~10k chars is a defect** —
  thousands of tokens the user can't see or control.
- **The default (plain click) is the what-I-see variant.** Wire `agent` = the
  focused rendered-view payload, label it via `agentVariant`
  (`position:"first"`); the raw full dump is the "Everything" menu variant,
  never the default.
- **Variants are shaped by USAGE, not arbitrary slices.** Think through what is
  non-optional on this page vs optional. Good menus: "Overview + counts" /
  "Overview + summaries" / "Transcript focus" / "Everything" (cx-explorer
  bundle); "Schema + sample" / "This view (md)" / "Column profile" /
  "Full rows" (cx-explorer tables).
- **Custom composer levers, by data shape** (offer the ones that fit — never
  blind truncation): format (Markdown/CSV/JSON/key-value) · row count
  (All/5/25/100/custom) · which rows (first/last/sample) · per-cell char cap ·
  visible-columns-only · drop-empty-columns · stub-JSON-cells · include-nulls ·
  schema header · strip binary — and for narrative data: per-message caps,
  include thinking / tool calls / tool results, last-N, model-visible-only.
  Multi-table bundles get a **per-section level dial** (Full / Trunc / Per-row /
  Summary / Counts / Off) with the overview header recommended always-on.
- **Live char / ~token / byte counts in every dialog** — the user must know
  what they're getting into. The chrome (`AiCopyMenu`) renders these free.
- **A stub is honest:** it states what was omitted and how big it was, so the
  agent knows to ask. Shortened variants are lossy in DATA, never in ambient
  context — envelope `context` + KPIs identical across variants.
- **"With prompt" variants:** where a payload has one obvious next action,
  offer a sibling variant that wraps the faithful payload in an instruction
  brief. Canonical: Error Inspector — "Error(s)" (`agentVariant`, first) +
  "Error(s) with prompt" (`lib/diagnostics/buildCapturedErrorPayload.ts`:
  prompt before, payload in its own XML tag, reminder after). Same family:
  the dead-ends / lint-debt consoles' paste-ready repair-brief buttons
  (`features/admin/*/fix-prompt.ts`).
- Shortening logic lives in **pure per-data builders**
  (`(data, opts) => { text, ...counts }`, no React) in a `*AiSources.ts` /
  `copy.ts` module — never in the chrome, never inline at callsites. Derive
  preset variants from an existing section list (Backlinks does
  `applyGroomerPreset` over its groomer sections — never a second list).
  `MatrxDataTable` takes `copy.aiVariants`/`copy.aiCustom` for the toolbar
  view copy.
- **`AgentCopyGroomerLauncher`** — the page-level "Copy for AI". Opens a
  WindowPanel where the user grooms the whole-page payload: sections with
  `full/compact/brief/off` dials, Everything/Balanced/Minimal presets, live
  size (chars + ~tokens), live preview. Full contract in the README. The
  page-level "everything" is **composed from the per-section builders**, never
  a parallel implementation.
- The **"Copy for AI" button is a deliberate seam**: when the surfaces-registry
  + tool-injection layer lands, it flips from "copy to clipboard" to "hand
  context + callable actions to the agent" and every existing callsite comes
  along for free. Keep `kind` slugs stable and `attributes` meaningful.

## Exemplars — study before building, best first

1. **aidream cx-explorer** (admin dashboard, `/cx-explorer`) — the platform's
   best. `apps/dashboard/src/components/agent-copy/`: `tableRowsAiSources.ts`
   (generic any-table variants + custom export), `conversationBundleAiSources.ts`
   ("Open composer…" per-table level dials), `conversationAiSources.ts`
   (transcript levers), `conversationTranscript.ts` (reference pure builder),
   `features/cx-explorer/model-context/wire-ai-source.ts` (honest stubs +
   mirrored metrics). Note its separate JSON-download icon beside Copy-for-AI.
2. **Backlinks** — `features/marketing/components/backlinks/BacklinksWorkspace.tsx`:
   full-granularity page (cards + dimension lists + table + groomer), presets
   derived from the groomer sections.
3. **Error Inspector** — the "with prompt" sibling-variant pattern (above).
4. **Access planner** — `features/admin/relationships/access-planner/copy.ts` +
   `buildPanelView` in `AccessPlannerImpl.tsx`: what-I-see panel payload from
   LIVE form state with `unsaved_changes`, blockers verbatim, KPI framing;
   full dump demoted to "Everything".

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
    data: row,                             // rendered-view data (see MISSION)
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
`JsonInspector` takes `agentCopy` for raw-JSON surfaces.

### Whole-page: quick pair + Groomer

Page header gets a quick `CopyButtons` pair (human snapshot + what-I-see
payload with an Everything variant) AND an `AgentCopyGroomerLauncher` whose
sections mirror the page's areas. Declare sections once and derive the quick
payload from `sections.build("full")` — never maintain two section lists.

### Step-by-step

1. **Find where the list actually renders.** Most `/administration/*` pages are
   thin wrappers (9–25 lines) that delegate to a feature component — the `.map()`
   lives in `features/*`, not the page. Wire it in the **feature component** so
   admin AND user surfaces both benefit. (Quick check: `wc -l` the page; <30
   lines ⇒ it's a wrapper, go find the component it renders.)
2. **Answer the MISSION question** for this surface: what is the user doing
   here, what does the page lead with, where do errors render, what is live
   form state? That answer IS the primary payload spec. Then judge the size
   class per the table above.
3. **Add a shared `human` summary** in the feature's `format.ts`/`copy.ts`
   (e.g. `lib/sandbox/format.ts`, `features/ai-models/format.ts`). Reuse it for
   both the row and the list. **Never duplicate** the summary across files.
4. **Per-row:** drop `<CopyButtons size="icon" …>` in the row's action cell.
5. **Whole-list:** drop `<CopyButtons size="sm" …>` in the toolbar/header,
   guarded by `list.length > 0`.
6. **Detail/record pages:** one `<CopyButtons size="sm">` in the header that
   copies the rendered record view — live URL + full CURRENT state is the
   highest-value capture.
7. Set a stable `kind`, a clear `location` (include the route), and useful
   `attributes`/`context` (counts + the page KPIs).
8. **Run the acceptance test** (payload vs screenshot), then
   `pnpm exec tsc --noEmit` the touched files; commit per page/component.

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
   `+aiCustom` composer) per the sized-to-data table above, and note truncated
   lists that lack a show-all — those are defects, list them.
4. **Audit EXISTING payloads against the MISSION.** A wired surface whose
   payload is a raw dump, reads saved rows instead of live state, or misses
   rendered errors/KPIs is a defect even though the buttons exist — list
   these too.
5. **Emit the coverage table** (surface → element → class → current state →
   planned control) in your summary/handoff BEFORE writing code, then wire in
   per-page commits using the step-by-step above.

## Pitfalls (these will bite you)

- **Clickable rows:** if the `<tr>`/row has an `onClick` (navigate/select),
  wrap `<CopyButtons>` in `<span onClick={(e) => e.stopPropagation()}>` (or put
  it in a cell that already stops propagation) so copying doesn't also
  select/navigate. See `AiModelTable` RowActions and the invitation-requests
  cell for the pattern.
- **Don't reinvent the envelope.** The agent flavor is `buildAgentPayload` only.
  Don't hand-roll xml or a JSON dump at the callsite (that anti-pattern is what
  this primitive replaced on the admin sandbox page).
- **Never remove a working feature.** Consolidate duplicate AI buttons into ONE
  dropdown; never delete an existing copy / download / redaction affordance.
- **Skip non-record surfaces.** Tools/composers/visualizers (email composer, SQL
  workbench, schema visualizer, markdown tester, component demos) have no
  copyable record — don't force buttons there. Copy belongs on lists & records.
- **Don't overwhelm.** Favor per-row + copy-all on lists; a single whole-record
  copy on detail pages. More than that clutters.
- **`size="icon"` is h-7 w-7;** if a row uses denser actions (h-6) it'll be a
  hair larger — acceptable, don't fight it with overrides.

## Rollout status (update this as you go)

**Done:**
- Primitive + README + roadmap (`components/agent-copy/`), `xs` size, groomer
  window (`AgentCopyGroomerWindow` + launcher + `groomer-types.ts`).
- Graded Copy-for-AI variants: `AiCopyMenu`, `CopyButtons.aiVariants`,
  `CopyButtons.aiCustom`, `MatrxDataTable copy.aiVariants/aiCustom`, shared
  `clipboard.ts`, plus `buildGroomerPresetPayload` / `groomerPresetVariants`
  (groomer-types) and `keyFieldsAiVariant` (marketing `copy-payloads.ts`).
  Wired on the medium/massive marketing site tabs (keywords, ranks, findings,
  analysis, audit, links, crawls, discovery, cost + backlinks reference);
  small bounded tabs deliberately keep the plain pair — the sized-to-data call
  is part of the job. `AiCopyMenu` remains in step with aidream
  `apps/dashboard/src/components/agent-copy/AiCopyMenu.tsx`.
- Built-in integrations: `MatrxDataTable` `copy` config → row/view/window/field
  pairs; `DataRowInspector` per-field hover copy; `JsonInspector` `agentCopy`.
- Shared formatters: `lib/sandbox/format.ts`, `features/ai-models/format.ts`,
  `features/marketing/components/backlinks/format.ts`.
- Pages: sandbox admin / user-list / detail; `administration/admins` (admins +
  audit); `administration/ai-tasks`; `administration/invitation-requests`;
  `/marketing/brands/[id]/sites/[id]/backlinks` (the full-granularity + groomer
  reference page); relationships hub — all tabs; the planner is the
  what-I-see reference (`access-planner/copy.ts`).
- Feature components: `features/ai-models` (AiModelTable + filter bar),
  `features/tool-registry/mcp-admin` + `mcp-tools` (incl. aiCustom export
  dialog; sanitized formatters), `feedback` (all four tabs + detail dialog,
  shared `feedback/format.ts`), `system-agents/*` (roster, shortcuts, apps,
  content blocks, lineage; shared `features/agents/format.ts` +
  `features/agent-shortcuts/format.ts`), `agent-apps/*` (grid, overview,
  versions, admin aiCustom, executions, rate-limits, analytics, categories,
  dashboard; shared `features/agent-apps/format.ts`).

**Known debt:** surfaces wired BEFORE the MISSION section existed (most of the
list above) carry raw-dump payloads that fail the what-I-see test — auditing
them is step 4 of the module-audit protocol. Any you touch is boy-scout
territory: upgrade the payload while you're there.

## Roadmap — from "copy" to "connect"

The full vision lives in [`components/agent-copy/README.md`](../../../components/agent-copy/README.md):
page-level state capture, integration with the **surfaces registry**
(`features/surfaces/`, see the `surface-authoring` skill), automatic screenshots
(`hooks/useScreenCapture.ts`), and **dynamic tool injection** (register a page's
state + callbacks so an agent can call them with args). Keep `kind`/`attributes`
stable now so they become the tool vocabulary later. Extraction stays a pure
function of (data, options) so AI features can call the same builders with no
clicking; payloads self-describe (summary + counts) so a future agent can fetch
just the slice it wants.
