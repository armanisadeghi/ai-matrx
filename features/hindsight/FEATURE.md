# FEATURE: Hindsight — continuous review + Replay

**Status:** Active · **Routes:** `/administration/agents/hindsight` (admin
console, Agents → Health & Drift) + `/agents/{id}/hindsight` (Layer 2 — a
user's own agent's "Review" tab, now the **improvement workspace**) · **Entry
points:** [`components/HindsightPage.tsx`](./components/HindsightPage.tsx)
(admin) ·
[`workspace/ImprovementWorkspace.tsx`](./workspace/ImprovementWorkspace.tsx)
(product)

**Layer 2 (2026-08-15).** This feature dir moved from
`features/administration/hindsight/` to `features/hindsight/` because it is no
longer admin-only: a user turns on continuous review for an agent THEY OWN from
the agent's "Review" tab (`AgentModeController` mode `hindsight`). The server
scopes everything by `created_by` for non-admins (aidream router), so both
surfaces share `api.ts` unchanged. `DoorAudienceProvider` (in
`components/door-audience.tsx`) decides whether doors open admin routes or
product routes (`/agents/{id}`, `/chat/{id}`) — the product tree wraps itself
in `audience="product"`; the admin console needs nothing (default `admin`).
Replay triggering and tool/workflow/environment subjects remain admin-only
server-side.

**The improvement workspace (2026-08-16).** The product surface is a
three-pane workspace, not a dashboard panel — **the conversation with the
reviewer is the center of the experience** (Arman's directive): tell the
intelligence watching your agent what it got right or wrong, and watch better
proposals appear.

| Pane   | Component                                                              | What it holds                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left   | [`workspace/EnrollmentSidebar.tsx`](./workspace/EnrollmentSidebar.tsx) | Review now / pause / archive, progress-to-next-review meter, editable reviewer focus (goal), compact spend, review timeline — selecting a review opens its conversation                                                                                                                                                                                                                       |
| Center | [`workspace/ReviewerChat.tsx`](./workspace/ReviewerChat.tsx)           | The selected review's thread as a real chat: the review's conclusions as the opening message, then the human↔reviewer exchange, composer pinned at the bottom                                                                                                                                                                                                                                 |
| Right  | [`workspace/ImprovementsRail.tsx`](./workspace/ImprovementsRail.tsx)   | Findings grouped **Waiting for you** vs **Decided** (canonical `FindingCard`), plus [`workspace/VersionLadder.tsx`](./workspace/VersionLadder.tsx) — recent agent versions via the `agx_get_version_history` RPC (direct Supabase, same source as the version-diff page), applied findings marked "from review", doors to `/agents/{id}/v/{n}`, `/agents/{id}/latest`, and `/agents/{id}/run` |

Not enrolled → [`components/EnableCard.tsx`](./components/EnableCard.tsx)
centered. Below the full three-pane desktop width, the conversation keeps the
workspace and review history/settings plus proposals/versions move into the
canonical `MobilePanelShell` drawers; no pane disappears and the page keeps one
controlled scroll surface. "Guide" on a finding routes into the center chat via `FindingCard`'s
optional `onGuide` prop (scope chip on the composer, thread switched to the
finding's review) — the admin console omits `onGuide` and keeps the inline
`DiscussPanel`. Shared mutations live ONCE in
[`hooks/useEnrollmentActions.ts`](./hooks/useEnrollmentActions.ts) (review
now / pause / goal / archive) — never re-implement them beside a component.
`AgentHindsightPanel.tsx` was the single-panel predecessor and is DELETED —
do not resurrect it.

Hindsight is how the platform reads its own history and improves itself. Enroll
an **agent, workflow, tool, or environment**; every N real runs a reviewer agent
reads the ACTUAL transcripts — never metrics alone — and proposes fixes across
four levers (instructions · resources · tool/interface · architecture). Replay
re-runs a real historical request under a candidate change and a judge reports
better / same / worse / regressed.

**This is the ONE home for that UI.** It was ported here from the aidream
dashboard on 2026-08-11 and that page + route + sidebar entry were deleted in the
same change. Hindsight watches every client (sandbox, matrx-local, the Chrome
extension) and its Layer 2 is a user-facing product feature, so it belongs in the
platform admin, not in a backend-repo dashboard. Do not re-create a second copy.

## Map

| Piece                       | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page                        | `components/HindsightPage.tsx` — list + platform spend + detail pane                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Detail                      | `components/EnrollmentDetailPanel.tsx` — subject, spend, cadence, findings, reviews                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Internal Affairs (C-19)** | `components/ChangeHistoryPanel.tsx` (every applied change to a governed agent/tool/workflow — version from→to, provenance tier, the finding that caused it, a door on both) + `components/FindingEffectivenessPanel.tsx` (per lever per unit: proposed/applied/rejected/**reverted**, accept + revert rates, time-to-decision, cost movement). Both mounted at the bottom of `HindsightPage`; API `getChangeHistory` / `getFindingEffectiveness`; server views in aidream migration `0375`. Read-only — Internal Affairs never writes.      |
| Enroll                      | `components/EnrollDialog.tsx` — five enrollable kinds (agent · **orchestra** · workflow · tool · environment), real pickers, and the **lens** (which runs the reviewer reads + how much of each it sees)                                                                                                                                                                                                                                                                                                                                    |
| Finding                     | `components/FindingCard.tsx` — levers, confidence, replay verdicts, the canonical adjacent Copy / Copy-for-AI controls (AI menu: contextual finding + JSON), Apply / Reject / **Guide** / **Revert** (applied state), and `components/RegressionCasesFromFinding.tsx` (C-17: turn a cited recorded call into a permanent test; admin-only). `copy.ts` owns the one rendered-view projection shared by human and agent copy.                                                                                                                 |
| Revert                      | `components/RevertButton.tsx` — the ONE revert affordance (button + confirm naming "returns to v{n}" + version-diff door + receipt toast), shared by `FindingCard` and `VersionLadder`. Renders only on `status='applied'` findings; the ladder shows it only on the CURRENT `from review` row (reverting a non-current version is meaningless, so the door is hidden, not disabled). Server contract: `POST /hindsight/findings/{id}/revert` re-promotes the pre-apply version as a NEW version row — see aidream's hindsight `FEATURE.md` |
| Discuss (admin)             | `components/DiscussPanel.tsx` — the reviewer's thread + the reply box; product uses `workspace/ReviewerChat.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Thread message              | `components/ThreadMessageRow.tsx` — ONE renderer for reviewer-thread messages (`flat` admin / `chat` product variants)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Review                      | `components/ReviewRow.tsx` → `components/ReplaysTable.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review progress             | `components/ReviewProgress.tsx` — the "minutes, not seconds" elapsed panel, shared by both surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Layer 2 workspace           | `workspace/ImprovementWorkspace.tsx` — enable CTA or the three-pane workspace, product doors                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Enrollment actions          | `hooks/useEnrollmentActions.ts` — review-now / pause / goal / archive mutations, one home                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Doors                       | `subject-doors.ts` (audience-aware) + `components/door-audience.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Types                       | `types.ts` — DERIVED from the OpenAPI contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Client                      | `api.ts` — `lib/api/typed-client.ts` over aidream `/hindsight/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Backend contract + earned traps: `aidream/aidream/services/hindsight/FEATURE.md`.
Wire shapes: `aidream/aidream/api/schemas/hindsight.py`. Work order:
`aidream/docs/handoffs/hindsight.md`.

## Doctrine

- **Types are derived, never hand-mirrored.** Every shape in `types.ts` aliases
  `components["schemas"][…]`. The aidream router used to return bare `dict`s;
  they were given real response models so this link exists. If a handler ever
  reverts to an untyped dict, the contract degrades to `unknown` and this file
  is where the damage lands — fix the backend, don't hand-write the type here.
  `EnrollRequest` is a collision — authenticator and Hindsight both export that
  name, so OpenAPI qualifies it. Alias
  `aidream__services__hindsight__enrollment__EnrollRequest`, never the short
  key.
- **Reuse, not re-implementation.** Data reads go DIRECT to Supabase
  (`@/utils/supabase/client`) for the agent / workflow / tool-name pickers;
  compute goes to aidream through the typed client. No bespoke `fetch`.
- **No dead ends.** Every record this surface names opens: the subject
  (agent → `/administration/agents/system-agents/agents/{id}`, tool →
  `/administration/agents/mcp-tools/{id}` resolved from the stored NAME,
  workflow → the workflow studio), every real run a review read, the reviewer's
  own transcript, and both conversations behind a replay. Reviewer evidence
  cites raw conversation UUIDs — those are linkified (`splitEvidenceIds`).
  `environment` subjects are deliberately doorless: an environment is a
  conversation SELECTOR, not a row, so its selector renders as chips and its
  transcripts are reached through the reviewed-runs list.

## Guide — the third path, and why it exists

Apply / Reject is not enough. Arman's case: the reviewer caught small problems on
the AI Model Config Sync agent and **missed the biggest point** — that we need
scrapable model-list URLs per provider, verified with our scraper, built into the
system prompt — and there was no way to tell it so.

`DiscussPanel` is that path. It renders the reviewer's own conversation and lets
the human reply with guidance; the reviewer answers and usually proposes NEW
findings. Two rules the UI must keep:

- **A reply CREATES findings, it does not edit the one in front of you.** Never
  frame it as editing. On resolve, refetch the whole enrollment — proven live:
  one reply took a review from 2 findings to 6 and deprioritized the original.
- **It takes about a minute** and `status: "failed"` is a normal outcome to
  render, not an exception. The typed message stays in the box on failure — a
  carefully written paragraph must never be lost to a transient error.

`available: false` from `/thread` is also normal (reviews from before threaded
reviews persisted only a cost spine); render the backend's `reason` sentence and
disable Send, never an empty void.

Message bodies render through the canonical markdown pipeline (`MarkdownStream`
in persisted mode — no `requestId`, not a stream). Never hand-render one.

**`reply` is PROSE — never sniff it for JSON.** The reviewer is a
structured-output agent, and until 2026-08-15 `discuss` handed back its raw
payload, so this panel collapsed a `{`-shaped reply behind a toggle. That
workaround is DELETED: the reviewer now writes a `reply_to_human` field and
aidream (`services/hindsight/discuss.py`) splits it out — for the discuss
result AND for every assistant turn in `/thread`. Render both directly. JSON
appearing here again is a SERVER regression; fix it there, never re-add a
client-side fallback.

## Internal Affairs — two ways to lie with these numbers

Both are enforced by helpers in `types.ts`; route through them rather than
reading the raw field.

- **`versionFromIsInferred(row)` — an inferred `version_from` is NOT a fact.**
  The server sets `version_from_confidence` to `'recorded'` only when the number
  was stamped at apply/revert time; `'inferred'` means "the previous version
  row", which is wrong whenever a version promote rolled a definition back
  without writing a row. `ChangeHistoryPanel` prefixes inferred values with `~`
  and explains on hover. Rendering the two identically turns a guess into an
  audit claim in a surface whose entire job is accountability.
- **`hasSignal(value)` — a null rate or cost is NO SIGNAL, never zero.**
  `revert_rate === null` means nothing has been applied on that lever;
  `revert_rate === 0` means changes were applied and none were undone. Rendering
  null as `0%` invents a measurement and hides the one number
  (`revert_rate > 0`) that says "stop trusting this lever on this unit".
- **A null `actor_tier` is the pre-provenance era, not an unknown author.** The
  platform reads an unstamped change as human and never backfills it, so the
  panel shows "Human (unstamped)" rather than inventing a mystery or asserting a
  clean fact.

## The three things that are easy to get wrong

1. **Cost vocabulary is load-bearing — never blur it.**
   _Replay cost_ is money Hindsight SPENT. _Original cost_ is what the historical
   run cost: a BASELINE being beaten, not a charge, and never counted as spend.
   **A replay whose `status !== "completed"` must never render a dollar
   comparison** — it shows "did not run", "nothing spent — it never reached the
   model", and the reason. Rendering `$0.000` there reads as _free_ instead of
   _never happened_, which is the exact confusion this port had to fix.
   Guarded by `replayRan` / `replaySpend` / `replayBaseline` in `types.ts`.

2. **"Review now" runs the whole reviewer inline — minutes, not seconds.**
   The POST blocks. A bare spinner reads as hung, so `ReviewProgress` shows
   elapsed time, how many transcripts are being read, and that leaving the page
   does not stop the run (the server finishes it either way).

3. **The enroll dialog must survive a stray click.** Radix dismisses on any
   pointer-down it judges "outside" — including the overlay strip when a tall
   form overflows a short viewport, and scrollbar drags. `onPointerDownOutside` /
   `onInteractOutside` are prevented, the body scrolls internally, and the
   actions stay pinned. It also **resets on every open**: the dialog is never
   unmounted, so without that reset the next open still holds the last subject
   with Enroll already enabled — one click from enrolling the wrong thing twice.

## Assist deep links

Hindsight assists point here, and the page honours them:
`?enrollment=<id>&finding=<id>` selects that enrollment;
`?enroll_tool=<name>` opens the enroll dialog pre-set to that tool. Written by
`aidream/services/hindsight/review.py` and `detector.py` — change both sides
together. **The URL enrollment wins synchronously over mounted selection
state.** Route transitions reuse the page; effect-based synchronization can
briefly fetch the previous enrollment and turn a stale selection into a queued 404.

## Verified (2026-08-11, real clicks, real data)

All four kinds enrolled through this dialog against production; Apply took the
AI Model Config Sync agent to **v20**; Reject recorded a decision; a review run
from this page read 3 real Chrome-extension transcripts, cost $0.146, and
produced 2 findings; replay table renders the did-not-run case correctly; dark
mode checked. Guide proven end-to-end on the Chrome-extension environment
review: real guidance ("you missed that browser-tool failures are
indistinguishable") returned 4 new findings for $0.085 in ~2 minutes, the
findings list refreshed itself, and the original finding was deprioritized to
40% confidence.

## Change Log

- 2026-08-22 — Review calls may name exact example IDs for an immediate focused review without advancing the automatic watermark; `getPendingExamples` exposes the next automatic window with settled-state evidence so surfaces can warn when recent activity would otherwise be skipped.
- **2026-08-18** — The product workspace now clears the glass Agent header,
  keeps the reviewer conversation usable at ordinary desktop/tablet widths,
  and moves both secondary rails into named `MobilePanelShell` drawers below
  `2xl` instead of hiding or vertically stacking them. Finding cards use their
  own container width for action layout, and every load failure has a retry.
- **2026-08-18** — Deep-linked enrollment selection now wins during render,
  preventing reused admin pages from fetching the previous selection during a
  route transition and emitting an expected `enrollment not found` error.
- **2026-08-18** — Findings gained the canonical two-icon Copy / Copy-for-AI
  control. The AI icon opens contextual finding and JSON choices; both human
  and model-ready payloads use `copy.ts`'s rendered-card projection, including
  reasoning, evidence, proposal, verdicts, decision state, and live card state.
- **2026-08-17** — **Workflow steps became a subject, and a finding became a
  regression case.** Two doors that were dead ends.
  - **`workflow_node` is enrollable** (`ENROLLABLE_KINDS`): C-30's per-step
    input capture made one step of a workflow a reviewable subject. The dialog
    asks for TWO selections for this kind and only this kind — the workflow,
    then the step — because a node id is unique only inside its definition and
    the server refuses a half-identified subject. The step list is read off the
    definition's own `nodes` jsonb, so the picker can never offer a step the
    enrollment would then be refused for.
  - **"Make this a regression case" from a finding**
    (`components/RegressionCasesFromFinding.tsx`, mounted in `FindingCard`).
    The snapshot ids come from the server's `finding.snapshot_ids` — collected
    by the one C-13 rule that also decides which snapshots the retention pin
    protects. **Never re-derive them by scraping evidence text:** a case built
    on an unpinned snapshot is a "permanent" test that stops being reproducible
    at the next prune. Existing cases render with their last result (`error` is
    NOT `fail`) so the panel answers "did the check pass?", and the button is
    never offered twice for one snapshot. Admin-only, because the endpoint is
    (every re-check spends real money).
  - **`evidenceLine()` (`types.ts`)** — `finding.evidence` carries TWO shapes:
    reviewer sentences AND typed walk hops. The server contract said
    `list[str]`, which 500'd every read of a review containing a walk finding;
    it is now a union, and this helper renders a hop as a sentence instead of
    `[object Object]`.
  - **The walk descends into workflow steps** (`features/review-walk/`): the
    hop gate now trusts the server's own `UnitKind` instead of re-listing the
    kinds locally, which is exactly how a walk silently stops one hop short the
    day a new one lands.

- **2026-08-16** — **Lenses + orchestra subjects.** The enroll form gained the
  two lens knobs (`window_mode` + `window_n`, `lens_visibility`) and an
  `orchestra` kind; both lens defaults are the pre-lens behaviour, so an
  enrollment created without touching them is unchanged.
  - **Written for a Creator, not an engineer.** The options read "Everything new
    since the last review" / "The most recent runs, every time" and "The full
    picture" / "Only what it was asked and what it produced", each with the
    trade underneath. `since_watermark` / `unit_only` never reach the screen.
  - **The run count only exists for the mode that uses it**, and warns before
    submit when `max_examples_per_review` would clip it — the server logs the
    same clip, so neither side can report "we read the last 60 runs" when 25
    were read.
  - **`workflow_node` kept a label and icon but was NOT offered** (`ENROLLABLE_KINDS`
    in `components/tokens.ts`) while the server refused it. **Superseded
    2026-08-17 — it is now enrollable; see that entry below.**
  - **Door Law:** an orchestra subject opens `/agents/orchestras/{id}`, not the
    plain agent page — the members are the reason the kind exists. The picker
    lists agents carrying the `orchestra` marker edge (there is no orchestra
    table), which is exactly what the server validates.
  - The detail panel now STATES the lens; it decides what the reviewer saw, and
    invisible afterwards a reader cannot tell why a review looked at 10 runs or
    never mentioned a tool call.
  - **`lens_visibility` is not `visibility`** — the latter is the canonical
    access enum on every entity row. Server contract: aidream's hindsight
    `FEATURE.md` § Lenses.
- **2026-08-16** — Queued/mirror replays render honestly: `replayInFlight`
  (`types.ts`) marks `pending`/`processing` rows and `ReplaysTable` shows a
  neutral "queued"/"running" badge + "still in flight" copy instead of the red
  "did not run" failure treatment (the mirror queue writes rows as `pending`
  until the worker lands the verdict). Backend twin: `replay_failed_count`
  now counts only `status='failed'`.
- **2026-08-16** — One-click **revert** for applied findings (D-41): shared
  `RevertButton` on `FindingCard` (applied state, distinct amber icon+word
  `reverted` badge) and on `VersionLadder`'s current `from review` row; calls
  `POST /hindsight/findings/{id}/revert`; confirm names the returning version
  (`FindingOut.pre_apply_version`, stamped by apply) and doors to
  `/agents/{id}/v/{n}`; `reverted` joined the terminal statuses.
- **2026-08-16** — Layer 2 rebuilt as the three-pane **improvement workspace**
  (`workspace/`): reviewer conversation center-stage, review timeline +
  controls left, proposals + version ladder right. Extracted shared
  `useEnrollmentActions`, `EnableCard`, `ThreadMessageRow`, `ReviewProgress`;
  `FindingCard` gained the optional `onGuide` seam; deleted
  `AgentHindsightPanel.tsx`; toasts moved off bare `sonner`; `Bot`/`Sparkles`
  icons replaced (banned). Admin console unchanged.
- 2026-08-16 — Internal Affairs (C-19): change-history + finding-effectiveness panels added to the admin page, reading the two new `hindsight.*` views. Inferred version numbers are marked `~`; no-signal rates render `—`, never `0%`.
