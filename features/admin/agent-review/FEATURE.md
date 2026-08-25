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
| Triage contract         | `triage.ts`                                                   |

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
  the target-page column remains its own explicit door.
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

## Security and integration

- The admin layout and `agent.review_queue` super-admin RLS gate the review surface.
- Messaging keeps its participant access and real-time/unread machinery; Agent Review adds no parallel permissions or message store.
- The data path is direct `supabase-js`; no Next.js database proxy.
- `Agent Review First Pass` is the active recurring Codex reviewer: every 30 minutes, exactly one item per run. It uses only Codex's built-in Browser and stops before claiming work when that persistent profile is not signed in as an admin. Canonical credential locations are documented in the shared skill; secrets never enter automation text or queue evidence.
- Every transition to `ready_for_human` requires recorded verifier identity, verification time, and `assignment.state='awaiting_review'`. The rollout returned all 16 legacy rows missing that evidence to `submitted`, then validated the database constraint.
- The list defaults to the human inbox (`ready_for_human`) and exposes all workflow activity only through the explicit **All activity** view.

## Change log

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
