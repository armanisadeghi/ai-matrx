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
  legacy fallback) + success toasts. You pass `human` (readable text) and
  `agent` (an `AgentPayloadInput`, a prebuilt string, or a builder fn) + a
  `label`.
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
- Primitive + README + roadmap (`components/agent-copy/`).
- Shared formatters: `lib/sandbox/format.ts`, `features/ai-models/format.ts`.
- Pages: sandbox admin / user-list / detail; `administration/admins` (admins +
  audit); `administration/ai-tasks`; `administration/invitation-requests`.
- Feature component: `features/ai-models` (AiModelTable rows + AiModelFilterBar
  toolbar).

**Remaining high-value feature components** (each its own batch — trace the
component, wire row + toolbar, typecheck, commit):
- `features/tool-registry/mcp-admin` (`McpServersAdminPage`) + `mcp-tools`
- `feedback` → `FeedbackManagementContainer`
- `system-agents/*`
- `agent-apps/*`

---

## Roadmap — from "copy" to "connect"

The full vision lives in [`components/agent-copy/README.md`](../../../components/agent-copy/README.md):
page-level state capture, integration with the **surfaces registry**
(`features/surfaces/`, see the `surface-authoring` skill), automatic screenshots
(`hooks/useScreenCapture.ts`), and **dynamic tool injection** (register a page's
state + callbacks so an agent can call them with args). Keep `kind`/`attributes`
stable now so they become the tool vocabulary later.
