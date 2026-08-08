# Agent Review Queue

**Status:** Live. **Route:** `/administration/users/agent-review` (super-admin via `app/(admin)/layout.tsx`). **Table:** `agent.review_queue` (single table — deliberately minimal, no RPCs, no satellites).

The one place agents register anything they built that Arman must go see/test, where his feedback flows back, and where repair work is routed by capability. The agent-side contract (insert, claim, verification, and status SQL) lives in **`.claude/skills/agent-review-queue/SKILL.md`** — that skill is the source of truth for agent behavior; this doc covers the surface.

## Parts

| Part              | Path                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Page (thin)       | `app/(admin)/administration/users/agent-review/page.tsx`                                                   |
| Client            | `features/admin/agent-review/components/AgentReviewClient.tsx`                                             |
| Direct DB service | `features/admin/agent-review/service.ts`                                                                   |
| Types             | `features/admin/agent-review/types.ts` (generated row/update types)                                        |
| Triage contract   | `features/admin/agent-review/triage.ts` (Zod schema, labels, legacy suggestion)                            |
| Migration         | `migrations/agent_review_queue.sql` (applied + ledgered)                                                   |
| Nav               | registered in `admin-categories.ts` ("Feedback" category) + `admin-navigation.ts` (Users → Communications) |

## Invariants

- **Data path is direct supabase-js** (`.schema("agent").from("review_queue")`), super-admin RLS (`public.is_super_admin()`). No API routes, no server actions, no Python.
- **`url` stores an app path** (`/demos/foo`) so links work on localhost and prod; absolute URLs only for external targets.
- **Status flow:** `pending` (agent) → `changes_requested` | `approved` (Arman, with `feedback`) → agent claims/repairs/verifies → `pending` again or `archived` (agent). Human approval remains explicit; assignment state does not replace review status.
- **Routing is multi-label.** `metadata.triage.lane` gives one primary owner lane; `required_tools` declares every capability the row needs. Filters operate on both. A task may require frontend code + database + authenticated browser + deployment.
- **Metadata is runtime-validated.** Missing and invalid triage are shown loudly and can receive a deterministic suggested classification. Never cast JSONB into a local mirror type.
- **Claims are coordination, not authorization.** Agents atomically claim ready rows with `FOR UPDATE SKIP LOCKED`, record a stable owner label, and hand off to a separate verifier for high-risk work. RLS remains the authorization layer.
- **"Copy for AI"** uses the shared `components/agent-copy` primitive, `kind: "agent-review-item"`, embedding the full row, feedback, and triage metadata.
- **Do not grow the table.** New needs go in `metadata` jsonb or don't belong here — the existing feedback system (`users.user_feedback`) is the heavyweight tracker; this stays a 4-status queue.

## Change Log

- 2026-08-08 — Evolved into the Agent Repair Board: versioned metadata triage, lane/tool filters, compact expandable rows, assignment/claim/verification contract, and agent-facing coordinator queries. No schema expansion; reused `metadata` JSONB and direct Supabase path.
- 2026-07-21 — Created: table + RLS, admin page, nav registration, `agent-review-queue` skill, CLAUDE.md pointer.
