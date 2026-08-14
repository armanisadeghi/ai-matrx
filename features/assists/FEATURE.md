# Assists — AI assists everywhere (frontend half)

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md` — read it before touching this feature in ANY repo. This doc covers only this repo's wiring.

**What it is:** the platform-wide one-click-AI-help primitive. Deterministic code, background agents, sweeps, and stream events notice things and produce **assists**; the user sees chips; accepting one dispatches the typed `action` binding through ONE registry. The standing design gate: every friction point gets asked _"could an AI button/chip do this for the user?"_ BEFORE a manual affordance is designed.

**Two layers, page first (Arman's ruling, 2026-08-08):** the PAGE layer is the original vision — chips that react to what's on THIS page, mounted with one line (`<AssistStrip surfaceName="…" />`); the AMBIENT layer (the global dock) carries background/server-noticed items. **Every agent building a page asks: which assists does this page need?** The dock is the overflow, never the substitute for in-place chips.

## 🚨 THE INTENTIONAL-ACTION LAW (Arman, 2026-08-08, after being burned)

A chip NEVER runs from an ambiguous gesture. Hover expands the FULL card immediately (complete title, readable markdown, scrolls when long — Claude Code is the bar); clicking the chip expands, never runs; execution is a **verb-labeled button** whose one-line explainer says exactly what will happen BEFORE it happens, and a **receipt toast** says what happened after. Truncated text with no instant full reveal is banned everywhere in this feature. Every new action kind MUST add a descriptor in `runtime/action-descriptors.ts` — a kind without one renders a disabled action, never a mystery button.

## The pieces (all in this feature unless noted)

| Piece                | File                                | Rule                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types + action union | `types.ts`                          | `AssistAction` is the source of truth for `platform.assists.action`. `toAssist` narrows rows; a row that doesn't narrow never renders. `navigate` may carry route-specific `label` / `confirm` / `receipt` copy when the URL represents a named UI intent; generic navigation keeps the shared defaults. `makeEphemeralAssist` = inline chip, no ledger row. |
| Service              | `service.ts`                        | ONE browser path to `platform.assists`. Mine-scope reads (THE VIEW LAW). `emitAssist` is idempotent by `dedupe_key`; `filterUndecidedKeys` makes dismissals durable (producers must call it before emitting).                                                                                                                                                |
| Redux                | `redux/assistsSlice.ts`             | `state.assists`; memoized selectors; `assistEmitted` / `assistDecided` keep the dock live without refetch.                                                                                                                                                                                                                                                   |
| Emit helper          | `redux/emitTracked.ts`              | `emitAssistTracked` = `emitAssist` + the local Redux mirror in one call — what every client-side producer uses (lives beside the slice because service.ts must not import the slice).                                                                                                                                                                        |
| Action registry      | `runtime/assist-action-registry.ts` | Mirrors content-ir's kind-action-registry (pure, capability-scoped ctx, never throws into UI). Kinds today: `launch_agent` (agentId or slotKey), `navigate`, `server_action` (allow-listed aidream POST), `surface_write` (via `applySurfaceWrite`, `origin:"user"` — the chip click is the gesture), `apply_page_meta` (lands a proposed marketing-page metadata edit as desired metadata + a CMS DRAFT via `applyFindingFix`; never publishes). New kind = one handler file + one side-effect import in `useAssistRunner.ts`.                       |
| Runner               | `runtime/useAssistRunner.ts`        | The ONE hook chips call. Accept = run action → decide row with receipt. Failures: toast + `captureError({source:"assists"})`.                                                                                                                                                                                                                                |
| Chip                 | `components/AssistChip.tsx`         | THE canonical collapsed rendering. Hover/click = expand (popover card); NEVER runs. Never fork a second chip.                                                                                                                                                                                                                                                |
| Card                 | `components/AssistCard.tsx`         | The expanded view: full title, markdown body (lazy `BasicMarkdownContent`), reasoning, source/confidence, verb button + "Not now" + "Don't show again".                                                                                                                                                                                                      |
| Descriptors          | `runtime/action-descriptors.ts`     | verb / explainer / receipt per action kind — the intentional-action contract.                                                                                                                                                                                                                                                                                |
| Page strip           | `components/AssistStrip.tsx`        | THE one-line per-page mount: `<AssistStrip surfaceName="…" filter?/>`. Self-hydrating; renders nothing at 0.                                                                                                                                                                                                                                                 |
| Dock                 | `components/AssistsDock.tsx`        | Global (ambient-layer) stack, mounted once in `app/DeferredSingletonCore.tsx`. Renders nothing at count 0. Low-confidence rows fold into the "+N more" line, which is a door to the manager. No realtime channel (deliberate — fetch on mount + focus). |
| Manager | `manager/AssistsManager.tsx` + `manager/useAssistsQuery.ts` | The triage surface at **`/assists`** — EVERY status, server-side filter / sort / paginate, per-status counts, Flagged / Unseen / snoozed toggles, bulk snooze + bulk dismiss, restore. Reads its own query, never the slice (decided history in the slice would put dismissed rows back in the dock), and reconciles decisions INTO the slice. Every row's title is the canonical `AssistChip`: the manager adds reach, never a second way to act. |

## DB

`platform.assists` (entity token `assist`, RLS via `iam.apply_rls` variant `entity`, visibility `personal`). Producers set `created_by` = the addressee. Migrations: `migrations/platform_assists_ledger.sql`, then `migrations/platform_assists_absorb_capabilities.sql`. Unique live-pending index on `dedupe_key`.

**The absorbed columns** — every one is read and written by the client. A column with no consumer is a half-landed migration, which is exactly what this table carried until 2026-08-13:

| Column | Carries | Absorbed from |
| --- | --- | --- |
| `evidence` jsonb | `{kind, label?, snippet?, href?, ref?, items?}` — the receipt rendered under "What we saw", with `href` keeping THE DOOR LAW. | kg-suggestions `context_snippet` + source preview; `web.finding`'s analysis result |
| `first_seen_at` / `occurrences` | When this dedupe key was FIRST noticed, and how many times it has recurred. A re-notice refreshes title / body / evidence and increments the count — it never moves `first_seen_at`, because "you have had this for three weeks" is the signal a plain upsert destroys. | `web.finding.first_detected_at` |
| `resolved_at` + status `resolved` | The condition stopped reproducing and nobody decided anything. `resolveAssistsByDedupeKeys()` is the producer API; a DB check makes status and timestamp inseparable, so `restoreAssist` clears both. | `web.finding`'s analyzer-owned resolve |
| `decision_note` | The user's own words at decision time, rendered when a row resurfaces. Written ONLY when supplied — a later plain decide never erases one. | kg-suggestions defer-with-note |
| `is_starred` / `viewed_at` | Triage flag + unseen dot. Reading a row in the manager stamps it seen, so the dot means "new since you looked", not "never clicked". | kg-suggestions manager |

## Producers live in the OWNING feature, not here

This feature owns the primitive; each producer sits beside the domain that notices:

- `features/content-ir/studio/shape-assists-producer.ts` — your shape has no custom component → "AI can build a custom UI" (ledger-backed, on `/shapes` visit, capped 5/sweep).
- `features/workflow-emit/GenericEmitRenderer.tsx` — a workflow output rendered through the generic viewer → ephemeral "Build a beautiful UI for this output" chip (the Surprise-me UI pattern).
- `features/marketing/search-console/insights-assists-producer.ts` — GSC insight findings become assists (money-page decay / CTR gap → launch `seo.page_analyzer` slot pre-filled with the code-compressed finding; unclassified backlog → navigate to the classification workbench or intake wizard). Swept once per site per session over a fixed 28d-vs-prev window anchored on the site's freshest data day; rendered inline by `components/GscAssistStrip.tsx` via `selectAssistsForSurface`.
- `features/notes/notes-assists-producer.ts` — unorganized-notes pileup (≥5 notes with no scope tags, no project/task link, no tags, default folder → launch the `notes.organizer` slot pre-filled with the note list). Swept once per user per session over already-loaded Redux state; rendered inline by `components/NotesAssistStrip.tsx` (mounted in `NotesView`).
- `features/tasks/tasks-assists-producer.ts` — overdue pileup (≥3 open, unsnoozed tasks past due → launch the `tasks.triage_assistant` slot pre-filled with the triage brief). Snooze-aware by construction (waits for `task_user_state`); rendered inline by `components/TasksAssistStrip.tsx` (mounted in `TasksHeaderControls`).
- `features/marketing/content-plan/plan-assists-producer.ts` — planned pages missing from the paired CMS site (plan nodes × the WF-11 page map → navigate to Setup's "Realize planned pages" rung). Never fires for an unpaired site (normal state, not a finding); rendered inline by `components/PlanAssistStrip.tsx` in the workbench, site-filtered via the dedupe key like the GSC strip.
- `private.sweep_marketing_finding_assists()` — the SEO analysis register's open findings become chips (growth-loop gap `G-FINDING-ASSIST`) without a page visit. pg_cron runs the deterministic producer every 15 minutes; it groups by site + check, ranks worst severity → affected scope → recency, and maintains at most three pending groups per site. Stable `seo.finding_rollup.<check>:<site>:site` keys preserve decisions, expired/current groups refresh in place, and groups that leave the top three become `superseded`. Each chip's explicit **Review findings** action navigates to the register filtered to that check; chip click still only expands. `features/marketing/findings-assists-producer.ts` now holds only this frontend contract, and `FindingsAssistStrip` is display-only on the register, priority queue, and audit rollup. Rows are personal and addressed to `web.site.created_by` **by design** — Arman's 2026-08-13 ruling below; do not build org-wide delivery.
- `features/marketing/components/backlinks/backlinks-assists-producer.ts` — six zero-token findings over already-loaded site state: lost-link reclaim, broken-target redirect drafts, critical anchor risk, human risk review, bounded review backlog, and competitor-gap investigation. `BacklinksAssistStrip` is site-filtered by dedupe key. Agent work launches the floating `seo.backlink_assistant` slot; the review action carries an explicit five-page route intent and its capture/assessment cost. Competitor intersections are treated only as an investigation signal, never fabricated into a missing-link count.
- Both `launch_agent` slots resolve to purpose-built platform agents, FLOATING (`use_latest`) because the client-side resolver refuses a version-pinned client slot: `notes.organizer` → **Notes Organizer** (`4c704248-…`), `tasks.triage_assistant` → **Task Triage Assistant** (`45131175-…`). Each is a conversational agent (system prompt only, zero variables — the chip's `draftText` becomes the user's first message via `setUserInputText`, exactly like General Chat) carrying the `data` + `data_action` tools, so it acts AS the user under RLS. Both are propose-then-apply: no write before the user agrees, the organizer never edits or deletes note content, and the triage agent never closes a task on its own judgment. Slots seeded by `migrations/agent_slots_assist_producers_seed.sql`, bound by `..._bind.sql`; swapping either agent is a slots-console change, no deploy.
- aidream background producers write rows via the ORM (see the system-of-record's aidream section).

## 🚨 THE CAPABILITY INVENTORY — what may be retired, and what blocks it

> **THE ABSORB-THEN-COLLAPSE METHOD** (Arman, 2026-08-09, doctrine in the
> cross-repo system-of-record): inventory every capability → judge each one →
> improve assists past 100% → migrate → **only then** retire. **Losing a
> feature is a worse outcome than not collapsing.**
>
> **A row in the "NOT YET" column BLOCKS retirement of the system it came
> from.** This table is the gate. Nothing is retired on a feeling that the new
> thing is nicer; something is retired when its row here says so.

Last taken against live code: **2026-08-13** (growth-loop gap `G-SUGGEST-FORK`).
Three systems model "here is something you could do": **assists**
(`platform.assists`), **kg-suggestions** (`scope_association_suggestions` /
`scope_item_value_suggestions` / `kg_suggestion_ack`), and **`web.finding`**
(the SEO audit register).

### Judged first: what is NOT a fork

- **`web.finding`'s domain half is not a suggestion system and is not being
  absorbed.** A finding is the durable identity of a `(site, subject, item)`
  condition that the analyzer opens, refreshes, reopens and resolves on its
  own — it exists whether or not anyone is ever offered anything. Its OFFER
  layer is what moved here (`features/marketing/findings-assists-producer.ts`,
  gap `G-FINDING-ASSIST`). The doctrine's own words: each system "keeps its
  domain tables where they carry domain shape".
- **`extend.wbx_seo_audit` is NOT dead and must not be deleted.** The 2026-08-09
  gap text called it "a dead `extend.wbx_seo_audit`". It is a registered
  canonical entity (`types/generated/entity-types.generated.ts`), RLS-applied
  and schema-moved on purpose, with zero runtime consumers — which under
  `/policies/unfinished-work-alarm.md` means **a previous agent was
  interrupted**, not that nobody wants it. Recommending its deletion is
  forbidden until Arman names it dead in writing. Sounding the alarm: the
  Chrome-extension SEO audit surface it was built for was never finished.

### kg-suggestions → assists

| Capability | Assists today | Verdict |
| --- | --- | --- |
| ONE shared decision card on every surface | `AssistChip` + `AssistCard`, everywhere including the manager | **better** — plus THE INTENTIONAL-ACTION LAW (hover expands, only a verb button runs) |
| Manager over every status, server-side filter / sort / paginate + stats | `/assists`, `manager/useAssistsQuery.ts` | **equal** |
| Defer (not now, ask again) | `snoozeAssist` + `SNOOZE_WINDOWS`, deliberately not a decision | **equal** |
| Defer-with-note, note re-rendered on resurface | `decision_note` + the dismiss-note box on the card | **equal** |
| Star + unseen dot + restore + bulk triage | manager flag column, unseen dot, `restoreAssist`, bulk snooze / dismiss | **equal** — bulk ACCEPT is refused on purpose (N real actions from one click is the opposite of the law) |
| Low-confidence floor: never interrupt, fold out of the list, stay reachable | `LOW_CONFIDENCE_THRESHOLD` + `partitionByConfidence`, folded in the dock behind a door | **equal** |
| Evidence: the snippet the proposal came from | `evidence` jsonb + the "What we saw" block | **equal** for the snippet |
| **Source preview: open the actual document, snippet highlighted, in a non-blocking panel that never dismisses the inbox** | `evidence.href` link-out only | **NOT YET** |
| **Per-RECORD chips** (a chip on *this note*, *this task*, *this scope item*) | only `selectAssistsForSurface` (per surface). The ledger has `entity_type` / `entity_id`; no selector or strip reads them | **NOT YET** |
| **Inline hint shapes — dot beside a field, badge on a table row, banner atop a section** | strip + dock only | **NOT YET** |
| **Enrichment: opaque id → human path, and the CURRENT value at click time** | producers write human copy at emit time, so no chip renders an id — but the body can go stale and claim a value that has since changed | **NOT YET** (staleness), better for id-rendering |
| **Overwrite warning + destructive confirm when accepting over an existing value** | `surface_write` is policy-gated but never diffs old vs new | **NOT YET** |
| **Accepting runs a domain RPC** (`set_context_value`, scope tagging, heavy-hitter create-scope dialog with a type picker) | five action kinds; `apply_page_meta` performs a real domain write (page intent + CMS draft), but none opens a parameter-collecting dialog before acting | **PARTIAL** |
| **Durable global notifier** (one delayed toast for genuinely-new items, two dismissal tiers, `kg_suggestion_ack`) | dock only — it never speaks up | **NOT YET** |
| **Per-user producer opt-out** (`user_preferences.auto_rag_enabled`) | no user-level off switch for any producer | **NOT YET** |
| **The queue is agent-FILTERABLE and deliberately not agent-DECIDABLE** (surface manifest + write targets on the manager) | `/assists` declares no surface manifest at all | **NOT YET** |

**Verdict: kg-suggestions CANNOT be retired.** Eight capabilities are missing,
three of them load-bearing (source preview, per-record chips, domain-RPC
accept). It also stays mounted in eight live surfaces (notes, tasks, scopes
hub, scope detail / items / list, orgs, settings) plus the `kgSuggestionsDrawer`
overlay, so "retire" here means those eight surfaces lose a working feature.

### `web.finding` (offer layer) → assists

| Capability | Assists today | Verdict |
| --- | --- | --- |
| Durable identity across re-crawls; first / last detected | `dedupe_key` + `first_seen_at` + `occurrences` | **equal** |
| Condition stopped reproducing → close it, nobody decided | status `resolved` + `resolveAssistsByDedupeKeys()` | **equal** on the client |
| Severity ordering | `priority` | **equal** |
| Bulk verbs | bulk snooze / dismiss | **equal** |
| Findings become chips at all | scheduled `private.sweep_marketing_finding_assists()`, displayed on three surfaces | **shipped** (`G-FINDING-ASSIST`) |
| **Reopen: a resolved condition that comes back** | `filterUndecidedKeys` treats `resolved` as answered, so a producer cannot reopen; only a human `restoreAssist` can | **NOT YET** |
| **Acknowledge ("I've seen this, I haven't done it")** | `viewed_at` is passive; snooze is a timer. No explicit acknowledged state | **NOT YET** |
| **Suppression orthogonal to status, with a reason — and WHOLE-CHECK suppression ("stop telling me about this check on this site")** | dismissal is per `dedupe_key` only. A user who wants a whole producer quiet must dismiss every chip forever, one at a time | **NOT YET** |
| ~~Team-visible: a finding belongs to a site, and any teammate sees it~~ | an assist is `visibility='personal'`, addressed to one `user_id` | **NOT A GAP — SETTLED** |
| **A decision here propagates to the domain row** — dismissing a finding chip does not acknowledge or suppress the finding | nothing links the two ledgers back | **NOT YET** |
| Check catalogue, remedies, resolution reconciliation | domain shape — stays in `web.finding` by doctrine | n/a |

> 🚨 **ARMAN'S RULING, 2026-08-13 — AN ASSIST IS ADDRESSED TO ONE PERSON, AND THAT IS THE DESIGN.**
> *"For suggestions, for now I'd rather just keep them for each individual because that's less
> complicated."* Org-addressed assists are **not** a gap, not a TODO, and not a thing to build
> toward. Do not add an org-visibility path, a team inbox, or a shared-chip variant on your own
> authority; a chip that fans out to a whole team is a change of product meaning that only Arman
> makes. The simplicity IS the decision — see the PRIME RULE in the workspace `CLAUDE.md`.

**Verdict: nothing in `web.finding` is retired**, and its offer layer cannot be
the last word until suppression-by-producer exists. Team addressing is no longer
a blocker — it is settled as out of scope by the ruling above.

### Retired in this pass

**Nothing.** Every candidate has at least one blocking row above. That is the
correct outcome of the method, not a failure of it — see Arman's ruling. The
next agent's shortest path to a real collapse, worst-first:

1. **Team-addressed assists** (an assist with an `organization_id` audience) — unblocks the `web.finding` offer layer and is the single widest gap.
2. **Producer-level suppression** (`source_key` + optional scope), which is also the thing that keeps the ambient layer from nagging.
3. **Per-record chips** (`entity_type` / `entity_id` selector + strip) — the columns are already there; this is a selector and a mount.
4. **An `rpc` action kind + a parameter dialog**, which is what kg-suggestions' accept semantics actually need.

## Producer rules (non-negotiable)

1. Always set a `dedupeKey` and exclude keys the addressee accepted or dismissed before emitting — client producers use `filterUndecidedKeys`; server/swept producers enforce the same ledger check in their transaction. A user's decision is durable and re-noticing must not resurrect the chip.
2. Cap per-sweep emissions; set `expires_at`.
3. Cheapest-first (canvas doctrine rung 5): deterministic state checks before any model call.
4. The action must DO something real. A chip that opens a blank chat is banned.

## Change Log

- 2026-08-13 — **Finding delivery no longer waits for attention.** The live diagnosis was exactly render-gating: `FindingsAssistStrip` called the client producer from `useEffect`, once per site/browser session, so 5,506 findings had produced only six ledger rows at page-open timestamps. Production moved to one private pg_cron sweep every 15 minutes. It emitted 15 pending site/check groups (three for each of five sites with open findings), superseded the five old pending render-era rows, and a second run refreshed those 15 with zero inserts. The sixth site has acknowledged-only findings and correctly emitted none. `FindingsAssistStrip` is display-only; the existing ledger, strip, dock, runner, and navigate action are reused. Current limitation is explicit: assists are personal and addressed to the site owner, not every teammate.
- 2026-08-13 — **The loop closes on the PAGE (`G-FINDING-FIX`).** `FindingFixCard` keeps the exact replacement + Apply-as-draft path (`applyFindingFix` → `updatePageIntent` + `executeCmsPush`) for an individual finding. The background coverage producer groups thousands of findings honestly and navigates to that canonical register/detail path; it does not pretend a grouped chip can safely batch-apply unlike fixes. No new write path and nothing publishes.
- 2026-08-13 — **THE CAPABILITY INVENTORY written, and the absorb finished in code (growth-loop `G-SUGGEST-FORK`).** `platform_assists_absorb_capabilities.sql` had landed seven columns that the client read and wrote NONE of — a half-landed migration is the same defect as an unwired feature. All seven are now live end to end: the `evidence` receipt block on the card, `first_seen_at` + `occurrences` (a re-notice counts and never moves the first sighting), the `resolved` status with `resolveAssistsByDedupeKeys()` so a condition that went away closes itself, `decision_note` (optional box on dismiss, re-rendered when a row resurfaces), and `is_starred` / `viewed_at` with a flag column, an unseen dot, and Flagged / Unseen filters in the manager. Producers can now also set `evidence`, `confidence` and `reasoning` at emit time. **Retired: nothing** — the inventory blocks every candidate, and that is the method working, not failing. Two doc lies fixed in the same pass: the action-kind count, and a pieces table that never mentioned the manager.
- 2026-08-13 — SEO findings first became assists (`G-FINDING-ASSIST` closed), but this proof covered only render-triggered production. The strip was mounted on the register, priority queue, and audit rollup, and its rollup filter was fixed. The later scheduled-producer entry above closes the coverage defect the three-row page-open proof did not test.
- 2026-08-13 — The notes/tasks assist chips stopped launching a generic chatbot: `notes.organizer` and `tasks.triage_assistant` now resolve to purpose-built Notes Organizer / Task Triage Assistant agents (Claude Sonnet 5, `data` + `data_action` under RLS, propose-then-apply with no self-authorized close or content edit). Placeholder General Chat binding retired.
- 2026-08-13 — Backlinks gained its canonical site-filtered page strip and deterministic six-family producer. Every action names its effect, review batches disclose and bound their cost, risk never auto-disavows, and competitor overlap is never mislabeled as a link-gap count. `navigate` descriptors now support route-specific intentional-action copy without changing generic navigation defaults.
- 2026-08-12 — Reconciled `emitAssistTracked`'s immediate Redux mirror with the live ledger's accumulated evidence/attention fields (`decision_note`, `evidence`, `first_seen_at`, `is_starred`, `occurrences`, `resolved_at`, `viewed_at`); behavior is unchanged and generated DB types now enforce the complete row.
- 2026-08-09 — Three page-layer producers proven on core surfaces: notes unorganized-pileup, tasks overdue-pileup (both `launch_agent` via new swappable slots `notes.organizer` / `tasks.triage_assistant`, seeded in `agent_slots_assist_producers_seed.sql`), content-plan missing-pages (navigate to the Setup bridge). All deterministic over already-loaded state, all rendered by the one `AssistStrip`.
- 2026-08-08 — UX overhaul to the Claude-Code bar (THE INTENTIONAL-ACTION LAW): hover/click-expand AssistCard, verb-labeled actions with explainer + receipt, generic per-page `AssistStrip` (GSC strip refactored onto it). Page-first doctrine recorded.
- 2026-08-08 — GSC insights producer wired (search-console feature); extracted `emitAssistTracked` so producers stop hand-mirroring rows into Redux.
- 2026-08-08 — Created: ledger, registry (3 action kinds), runner, chip, dock, first two producers (shapes missing-component, workflow-emit surprise-UI). Error Inspector source `assists` added.
