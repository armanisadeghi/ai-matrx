# Agent Review

**Status:** Live. **List:** `/administration/users/agent-review`. **Item:** `/administration/users/agent-review/[id]`. **Tables:** `agent.review_queue` + the canonical `communication.dm_*` conversation tables.

Agent Review is an agent-first quality pipeline. Agents submit, independently review, repair, and verify work before Arman sees it. Every item owns one durable Messages conversation so instructions, findings, replies, repairs, and later rounds never overwrite one another.

The agent contract is `.claude/skills/agent-review-queue/SKILL.md`; this document owns the product surface.

## Flow

`submitted → agent_review → agent_changes_requested ↔ agent_review → ready_for_human → human_changes_requested ↔ agent_review → approved → archived`

- **Only `ready_for_human` is Arman's normal inbox.** Submission is not a request for him to test unfinished work.
- **Every transition has a message.** `instructions` and `feedback` remain legacy summaries; the DM thread is the conversation and audit trail.
- **Rerun preserves history.** “Run agent review again” returns to `submitted` in the same thread.
- **Desktop leads.** The list is semi-tabular and the item workspace shows a left-to-right stage rail; mobile scrolls without changing the desktop information architecture.

## Surfaces

| Part                    | Path                                                          |
| ----------------------- | ------------------------------------------------------------- |
| List route              | `app/(admin)/administration/users/agent-review/page.tsx`      |
| Item route              | `app/(admin)/administration/users/agent-review/[id]/page.tsx` |
| URL-driven table        | `components/AgentReviewQueueTable.tsx`                        |
| Routed workspace        | `components/AgentReviewWorkspace.tsx`                         |
| Direct services         | `service.ts`                                                  |
| Registry classification | `registry.ts`                                                 |
| Status/types            | `types.ts`                                                    |
| Lane + search text      | `row-text.ts`                                                 |
| Backlog sweep (CLI)     | `scripts/review-queue-sweep.ts` (`pnpm review-queue:sweep`)   |
| Triage contract         | `triage.ts`                                                   |
| Surface scope (list)    | `surface-scope.ts`                                            |
| Surface write half      | `components/AgentReviewWriteTargets.tsx`                      |

## Data contract

- `agent.review_queue.conversation_id` uniquely links one `communication.dm_conversations` row.
- The insert trigger creates the group conversation, adds Arman as its participant, and seeds the submission message atomically.
- Conversation metadata carries `kind='agent_review'`, the review id, routed review URL, repository, domain, and feature.
- DM message `sender_id` remains the authenticated audit principal. `metadata.actor_kind` + `actor_label` identify the effective human or agent actor; messaging bubbles render that effective identity.
- Domain, feature, and repository are required registry identities (`platform.taxonomy_node`, `platform.repo`), never URL-derived labels.
- The list uses `MatrxDataTable` URL state: search, every column filter, sort, page, and selected record survive refresh and Back/Forward.

## UI contract

- The list's first column is **Open**. One click enters the routed review
  workspace in the current tab and opens the target page in a separate tab;
  the target-page column remains its own explicit door. Its compact button is
  marked as table control chrome, so the shared cell wrapper never splits the
  label or separates it from the arrow.
- Target pages stay on one line: `manage.aimatrx.com` destinations render as
  app-relative routes, external destinations retain their hostname, long labels
  truncate inside the column, and hover exposes the fully qualified URL.
- The detail header keeps Back and Open page fixed around a single-line fading
  title. Its only metadata line is the compact repository → domain → feature
  hierarchy; status is not repeated above the stage rail.
- The embedded review conversation allows either side's message bubble to use
  up to 80% of the transcript width so long review instructions remain readable.
- Data is labeled by columns. Status, classification, and repository never appear as unexplained chips whose absence hides missing data.
- Opening an item changes the route. The detail page owns the stage rail, target-page door, full conversation, and human actions.
- The same conversation appears in `/messages/[conversationId]`; Agent Review embeds the canonical messaging thread rather than cloning chat state.
- Blank domain/feature values render **Not assigned** instead of disappearing.
- 🚨 **Search never hides.** Typing a search widens the list to EVERY non-archived
  step, regardless of the workflow step being browsed, and says so in a visible
  line: how many matched and how many of those sit outside that step, with a
  **Narrow to \<step\>** control to go back. Search covers title, instructions,
  target page, repository, domain and feature names, lane, thread/branch, and
  notes (`row-text.ts` is the one definition of a row's searchable text) — not
  just the rendered columns. Archived rows stay out, and the empty state says so.
- **Filed by / lane** (`metadata.origin.agent_label`) and **Filed**
  (`created_at`) are columns, sortable and filterable like every other; an
  unlabelled row reads **Not labeled** rather than blank.
- Every row carries a **copy-link** button for its own page
  (`/administration/users/agent-review/[id]`), via the platform `useShare` hook —
  share sheet, then clipboard, then the manual copy dialog; the toast only claims
  a copy when a copy actually happened.

## Agent surfaces

Both routes are agent-aware surfaces, and they are TWO surfaces on purpose: the list can only emit true queue-wide counts because it reads every row, and the item page can only emit the open row's state — neither can honestly promise the other's values.

- `matrx-admin/agent-review` (list) emits queue counts per workflow status, repair-routing rollups from `metadata.triage`, the registry classification vocabulary, and a 25-row sample of the open view. Its one write target, `review_triage_classification`, re-routes ONE row (lane, priority, workstreams, required tools) through `updateReviewQueueRow` and re-reads the row to prove the write landed.
- `matrx-admin/agent-review-item` (workspace) emits the open row, its classification, its triage envelope, and the live feedback editor. Its one write target, `review_feedback_draft`, stages prose into that editor; nothing is saved.
- **No agent may change a row's STATUS on either surface.** This queue is where agents register their own work, so no write target exists for Request changes, Approve, Run agent review again, or Archive — every transition stays a human button press recorded in the review's conversation. Claim state (`metadata.triage.assignment`) and the verification record are equally off-limits from the page: they belong to the skill's atomic SQL claim protocol.

## Security and integration

- The admin layout and `agent.review_queue` super-admin RLS gate the review surface.
- Messaging keeps its participant access and real-time/unread machinery; Agent Review adds no parallel permissions or message store.
- The data path is direct `supabase-js`; no Next.js database proxy.
- Queue and registry reads use `runWithSessionRetry`; session loss stops before
  the three complete-list queries can reach PostgREST as `anon`.
- `Agent Review First Pass` is the active recurring Codex reviewer: every 30 minutes, exactly one item per run. It uses only Codex's built-in Browser and stops before claiming work when that persistent profile is not signed in as an admin. Canonical credential locations are documented in the shared skill; secrets never enter automation text or queue evidence.
- Every transition to `ready_for_human` requires recorded verifier identity, verification time, and `assignment.state='awaiting_review'`. The rollout returned all 16 legacy rows missing that evidence to `submitted`, then validated the database constraint.
- The list defaults to the human inbox (`ready_for_human`) and exposes all workflow activity only through the explicit **All activity** view.
- Each workflow count card is a real filter control: selecting it opens the all-activity view and applies the matching status filter to the canonical URL-driven table. The combined Changes card selects both agent- and human-requested changes, and the active card remains visibly pressed.

## The middle stage — the queue's structural weakness

Arman, 2026-09-07: _"I'm trying to find what you need me to review in agent-review
but I can't seem to find it — it's one of the biggest weaknesses of the system."_
Measured that day: **573 rows at `submitted` against 74 at `ready_for_human`**,
oldest submission 2026-07-24. Only `ready_for_human` reaches him, and the single
recurring promoter (`agent-review-first-pass`) moves ONE row per 30 minutes and
skips rows with no triage envelope, no `browser` tool, or no conversation — so
nearly everything agents built was invisible to him by design.

Two halves of the fix live outside this surface, and both are in the shared
`agent-review-queue` skill (canonical body: `common-docs/skills/`):

- `pnpm review-queue:sweep` — the operational entry point for a review pass.
  Lists `submitted` rows older than N hours grouped by lane and repository, each
  with its direct URL, flags rows the recurring worker can never pick up, and
  prints the claim SQL. It is a REPORT: it changes no row.
- The three communication rules — THE DIRECT-LINK RULE (every ask carries
  `…/agent-review/<id>`), THE OWNED-REVIEW RULE (the filing session dispatches an
  independent reviewer and only tells Arman after promotion), and THE LANE TAG
  RULE (`metadata.origin.agent_label` on every row).

A recurring `agent-review-sweep` schedule is PROPOSED, not created, in
`common-docs/operations/scheduled-tasks.md` § Proposed, NOT approved — per the
no-unapproved-schedules law.

## Change log

- 2026-09-08 — Marked the compact Open door as table control chrome so the
  shared cell wrapping boundary preserves its one-line label and arrow.
- 2026-09-08 — Tightened the list page's bottom edge to a 4px page gutter after
  the table-owned pagination footer (the table itself contributes no outer
  padding), and made the header actions and workflow rail horizontally usable
  on narrow screens instead of crushing labels into vertical text.
- 2026-09-07 — Search stopped hiding: it widens to every non-archived step with a visible match-count line and a narrow-back control, and now covers instructions, lane, notes and thread/branch instead of only the rendered columns (`row-text.ts`). Added the **Filed by / lane** and **Filed** columns and a per-row copy-link button; Copy-as/AI payloads carry the row's direct URL. Shipped `pnpm review-queue:sweep` for the unmanned promotion stage and recorded the three communication rules in the shared skill.
- 2026-08-31 — Put the review queue, taxonomy, and repository list reads behind the canonical session-retry boundary so an expired admin session cannot fan out anonymous permission errors.
- 2026-08-30 — Wired the five workflow count cards to the canonical URL-backed table status filter, including the combined Changes statuses and active-card state; switching to Ready for you or All activity clears that workflow-card filter.
- 2026-08-26 — Rebuilt both surfaces against the live agent-first pages: real emitters on the list and the item workspace, a working triage write target, a feedback-draft write target, and a separate `matrx-admin/agent-review-item` surface. The old manifest still described the retired human-first page (pending/changes_requested statuses, an archived toggle, per-row feedback drafts) and claimed an emitter in a file that never existed.
- 2026-08-25 — Widened detail-page messages to 80% of the transcript, removed redundant review-thread helper copy, and promoted Original target to the same heading treatment as Your review.
- 2026-08-25 — Compressed the detail header into fixed Back/Open doors, a fading single-line title, and one repository-to-feature hierarchy; removed the duplicate status and label/value grid.
- 2026-08-25 — Made Open enter the review workspace and launch its target in a separate tab; corrected effective-actor presentation so Codex messages show their task ID without borrowing Arman's avatar, while human-authored feedback is explicitly labeled Arman.
- 2026-08-25 — Normalized Target Page labels, constrained long destinations to one line, and exposed the full qualified URL on hover.
- 2026-08-24 — Activated the approved 30-minute, one-item Codex reviewer after a live pilot; isolated browser testing to Codex's built-in Browser; added and validated a database evidence gate; requeued 16 legacy unverified rows; and made the human list default to verified `ready_for_human` work only.
- 2026-08-20 — Rebuilt Agent Review as an agent-first workflow; migrated every active row from human-first `pending` to `submitted`; linked all 456 rows to durable DM conversations; added atomic thread creation, routed item workspaces, visible stage rails, semi-tabular URL-state list, effective agent actors in Messages, and preserved multi-round feedback.
- 2026-08-20 — Added registry-backed domain, feature, and repository classification with complete counts.
- 2026-08-14 — Feedback editors adopted `ProTextarea`; target page became an explicit button.
- 2026-08-08 — Added repair routing, assignment, and verification metadata.
- 2026-07-21 — Created the original human-first queue.
