# Google Search Console — Update Intake

This is the durable capture log for Arman's ongoing Google Search Console
update campaign. It exists so rapid, conversational data dumps are not lost
while multiple agents work on the system at the same time.

This file is an **intake record**, not a second source of truth. Settled product
and engineering doctrine belongs in [`FEATURE.md`](./FEATURE.md); cross-repo
implementation details belong in the relevant repo's feature documentation.
An intake item stays here until its meaning, evidence, disposition, and any
remaining questions have been captured.

## Capture protocol

For every new dump:

1. Add a numbered item below, preserving Arman's meaning and concrete details.
2. Record any local investigation: relevant files, current behavior, evidence,
   likely ownership, related work, and contradictions.
3. Distinguish reported facts, verified facts, hypotheses, decisions, bugs,
   feature requests, and open questions. Never silently convert one into
   another.
4. Do not implement code unless Arman explicitly changes the scope. Read-only
   investigation is expected when it can make the item more actionable.
5. Carry every unanswered question into the cumulative queue at the bottom.
   A later dump never displaces an earlier unanswered question.
6. When an answer arrives, update both the originating item and the queue.
   Preserve the answer and mark the question resolved rather than deleting it.
7. When an item becomes canonical, link the resulting documentation, issue,
   commit, migration, or deployed change and mark its disposition accurately.

## Status vocabulary

- **Captured** — recorded but not yet investigated.
- **Investigating** — evidence gathering is in progress.
- **Needs input** — progress depends on an answer from Arman.
- **Ready** — sufficiently specified for an implementation agent.
- **In progress** — another agent is actively handling it.
- **Resolved** — the requested outcome is complete and verified.
- **Canonicalized** — durable doctrine was promoted to its authoritative home.
- **Superseded** — replaced by a later explicit decision; the history remains.

## Campaign records

### GSC-000 — Intake and continuity workflow

- **Captured:** 2026-08-07
- **Type:** Working agreement
- **Status:** Canonicalized
- **Source:** Arman, direct conversation

#### Captured intent

Arman is coordinating a massive set of Google Search Console updates across
multiple agents and does not want to create a separate conversation for every
new finding. He will send successive, sometimes unstructured data dumps here.
This conversation owns durable capture, relevant repository investigation, and
the cumulative clarification queue. It does not own implementation unless
Arman asks for it explicitly.

Arman may send a new dump without first answering earlier questions. That is
expected. New material must still be captured immediately, and every unanswered
question must be repeated in the cumulative queue after each response until he
eventually answers it.

#### Repository placement and authority

- This log lives beside the Search Console dashboard's canonical feature doc:
  [`FEATURE.md`](./FEATURE.md).
- The broader marketing feature record is
  [`../FEATURE.md`](../FEATURE.md).
- The legacy page-stat retirement handoff is
  [`../../../docs/handoffs/gsc-page-stat-retirement.md`](../../../docs/handoffs/gsc-page-stat-retirement.md).
- The cross-platform product vision is
  [`../../../../common-docs/systems/ai-dream-platform/VISION.md`](../../../../common-docs/systems/ai-dream-platform/VISION.md).

#### Verified baseline

- The primary Search Console product surface is
  `/marketing/search-console` in `matrx-frontend`.
- Its canonical persisted performance spine is
  `seo.search_performance_daily`, read through the documented `seo.gsc_perf_*`
  RPC family rather than client-side raw aggregation.
- Cross-repo ingestion and scheduling are owned by `aidream`; browser data
  reads are direct to Supabase.
- At intake creation, other agents already had uncommitted changes in the
  Search Console Dig Here/classification area. This log was intentionally
  created as an isolated file without modifying or staging their work.

#### Disposition

The workflow is now recorded in this file and will govern subsequent entries.

### GSC-001 — Browser-native navigation fidelity

- **Captured:** 2026-08-07
- **Type:** Critical UX defect / navigation contract
- **Status:** Ready
- **Source:** Arman, direct production use

#### Requirements

- Back/Forward must replay every meaningful Search Console navigation state
  exactly, including all state required to reproduce the visible data view.
- Every navigational target must expose its complete destination URL and retain
  native link behavior, including Cmd/Ctrl-click and Open in New Tab.

#### Investigation

- Confirmed systemic history loss: `SearchConsoleWorkspace.applyState` sends
  every site, tab, range, comparison, filter, rule, insight, and row-drill
  transition through `router.replace`, overwriting the current history entry.
- Confirmed non-link navigation: portfolio cards, site switcher items, tabs,
  insight selectors, and row drills use click handlers on buttons or clickable
  containers, so modifier-click cannot open the destination in a new tab.
- URL coverage is incomplete: table query/sort/page state, Watchlist kind,
  Insights dimension/thresholds, traffic class/direction, chart metric
  selection, and floating drill-down state are local or overlay state. Durable
  navigation state must be classified and added to the canonical URL model;
  transient editor/dialog state should remain local.

#### Likely ownership

- Canonical URL codec: `lib/url-state.ts`
- History policy and top-level transitions: `components/SearchConsoleWorkspace.tsx`
- Native link conversion: portfolio, site switcher, tabs, insight selectors,
  dimension tables, and drill-down openers
- Regression coverage: URL round trips plus browser-level Back/Forward and
  modifier-click tests

#### Acceptance contract

A copied or newly opened URL reconstructs the same meaningful view; each
meaningful transition creates a history entry; Back/Forward replays transitions
without state drift; modifier-click opens the computed destination without
mutating the source tab.

## Cumulative unanswered questions

None yet.

## Resolved questions

None yet.
