# Assists — AI assists everywhere (frontend half)

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md` — read it before touching this feature in ANY repo. This doc covers only this repo's wiring.

**What it is:** the platform-wide one-click-AI-help primitive. Deterministic code, background agents, sweeps, and stream events notice things and produce **assists**; the user sees chips; accepting one dispatches the typed `action` binding through ONE registry. The standing design gate: every friction point gets asked *"could an AI button/chip do this for the user?"* BEFORE a manual affordance is designed.

**Two layers, page first (Arman's ruling, 2026-08-08):** the PAGE layer is the original vision — chips that react to what's on THIS page, mounted with one line (`<AssistStrip surfaceName="…" />`); the AMBIENT layer (the global dock) carries background/server-noticed items. **Every agent building a page asks: which assists does this page need?** The dock is the overflow, never the substitute for in-place chips.

## 🚨 THE INTENTIONAL-ACTION LAW (Arman, 2026-08-08, after being burned)

A chip NEVER runs from an ambiguous gesture. Hover expands the FULL card immediately (complete title, readable markdown, scrolls when long — Claude Code is the bar); clicking the chip expands, never runs; execution is a **verb-labeled button** whose one-line explainer says exactly what will happen BEFORE it happens, and a **receipt toast** says what happened after. Truncated text with no instant full reveal is banned everywhere in this feature. Every new action kind MUST add a descriptor in `runtime/action-descriptors.ts` — a kind without one renders a disabled action, never a mystery button.

## The pieces (all in this feature unless noted)

| Piece | File | Rule |
|---|---|---|
| Types + action union | `types.ts` | `AssistAction` is the source of truth for `platform.assists.action`. `toAssist` narrows rows; a row that doesn't narrow never renders. `makeEphemeralAssist` = inline chip, no ledger row. |
| Service | `service.ts` | ONE browser path to `platform.assists`. Mine-scope reads (THE VIEW LAW). `emitAssist` is idempotent by `dedupe_key`; `filterUndecidedKeys` makes dismissals durable (producers must call it before emitting). |
| Redux | `redux/assistsSlice.ts` | `state.assists`; memoized selectors; `assistEmitted` / `assistDecided` keep the dock live without refetch. |
| Emit helper | `redux/emitTracked.ts` | `emitAssistTracked` = `emitAssist` + the local Redux mirror in one call — what every client-side producer uses (lives beside the slice because service.ts must not import the slice). |
| Action registry | `runtime/assist-action-registry.ts` | Mirrors content-ir's kind-action-registry (pure, capability-scoped ctx, never throws into UI). Kinds today: `launch_agent` (agentId or slotKey), `navigate`, `surface_write` (via `applySurfaceWrite`, `origin:"user"` — the chip click is the gesture). New kind = one handler file + one side-effect import in `useAssistRunner.ts`. |
| Runner | `runtime/useAssistRunner.ts` | The ONE hook chips call. Accept = run action → decide row with receipt. Failures: toast + `captureError({source:"assists"})`. |
| Chip | `components/AssistChip.tsx` | THE canonical collapsed rendering. Hover/click = expand (popover card); NEVER runs. Never fork a second chip. |
| Card | `components/AssistCard.tsx` | The expanded view: full title, markdown body (lazy `BasicMarkdownContent`), reasoning, source/confidence, verb button + "Not now" + "Don't show again". |
| Descriptors | `runtime/action-descriptors.ts` | verb / explainer / receipt per action kind — the intentional-action contract. |
| Page strip | `components/AssistStrip.tsx` | THE one-line per-page mount: `<AssistStrip surfaceName="…" filter?/>`. Self-hydrating; renders nothing at 0. |
| Dock | `components/AssistsDock.tsx` | Global (ambient-layer) stack, mounted once in `app/DeferredSingletonCore.tsx`. Renders nothing at count 0. No realtime channel (deliberate — fetch on mount + focus). |

## DB

`platform.assists` (entity token `assist`, RLS via `iam.apply_rls` variant `entity`, visibility `personal`). Producers set `created_by` = the addressee. Migration: `migrations/platform_assists_ledger.sql`. Unique live-pending index on `dedupe_key`.

## Producers live in the OWNING feature, not here

This feature owns the primitive; each producer sits beside the domain that notices:

- `features/content-ir/studio/shape-assists-producer.ts` — your shape has no custom component → "AI can build a custom UI" (ledger-backed, on `/shapes` visit, capped 5/sweep).
- `features/workflow-emit/GenericEmitRenderer.tsx` — a workflow output rendered through the generic viewer → ephemeral "Build a beautiful UI for this output" chip (the Surprise-me UI pattern).
- `features/marketing/search-console/insights-assists-producer.ts` — GSC insight findings become assists (money-page decay / CTR gap → launch `seo.page_analyzer` slot pre-filled with the code-compressed finding; unclassified backlog → navigate to the classification workbench or intake wizard). Swept once per site per session over a fixed 28d-vs-prev window anchored on the site's freshest data day; rendered inline by `components/GscAssistStrip.tsx` via `selectAssistsForSurface`.
- `features/notes/notes-assists-producer.ts` — unorganized-notes pileup (≥5 notes with no scope tags, no project/task link, no tags, default folder → launch the `notes.organizer` slot pre-filled with the note list). Swept once per user per session over already-loaded Redux state; rendered inline by `components/NotesAssistStrip.tsx` (mounted in `NotesView`).
- `features/tasks/tasks-assists-producer.ts` — overdue pileup (≥3 open, unsnoozed tasks past due → launch the `tasks.triage_assistant` slot pre-filled with the triage brief). Snooze-aware by construction (waits for `task_user_state`); rendered inline by `components/TasksAssistStrip.tsx` (mounted in `TasksHeaderControls`).
- `features/marketing/content-plan/plan-assists-producer.ts` — planned pages missing from the paired CMS site (plan nodes × the WF-11 page map → navigate to Setup's "Realize planned pages" rung). Never fires for an unpaired site (normal state, not a finding); rendered inline by `components/PlanAssistStrip.tsx` in the workbench, site-filtered via the dedupe key like the GSC strip.
- Both new `launch_agent` slots (`notes.organizer`, `tasks.triage_assistant`) are seeded by `migrations/agent_slots_assist_producers_seed.sql`, defaulting to the General Chat agent — swap in purpose-built agents from the admin slots console, no deploy.
- aidream background producers write rows via the ORM (see the system-of-record's aidream section).

## Producer rules (non-negotiable)

1. Always set a `dedupeKey` and call `filterUndecidedKeys` first — a user's dismissal is durable; re-noticing must not resurrect the chip.
2. Cap per-sweep emissions; set `expires_at`.
3. Cheapest-first (canvas doctrine rung 5): deterministic state checks before any model call.
4. The action must DO something real. A chip that opens a blank chat is banned.

## Change Log

- 2026-08-09 — Three page-layer producers proven on core surfaces: notes unorganized-pileup, tasks overdue-pileup (both `launch_agent` via new swappable slots `notes.organizer` / `tasks.triage_assistant`, seeded in `agent_slots_assist_producers_seed.sql`), content-plan missing-pages (navigate to the Setup bridge). All deterministic over already-loaded state, all rendered by the one `AssistStrip`.
- 2026-08-08 — UX overhaul to the Claude-Code bar (THE INTENTIONAL-ACTION LAW): hover/click-expand AssistCard, verb-labeled actions with explainer + receipt, generic per-page `AssistStrip` (GSC strip refactored onto it). Page-first doctrine recorded.
- 2026-08-08 — GSC insights producer wired (search-console feature); extracted `emitAssistTracked` so producers stop hand-mirroring rows into Redux.
- 2026-08-08 — Created: ledger, registry (3 action kinds), runner, chip, dock, first two producers (shapes missing-component, workflow-emit surprise-UI). Error Inspector source `assists` added.
