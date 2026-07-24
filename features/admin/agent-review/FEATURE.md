# Agent Review Queue

**Status:** Live. **Route:** `/administration/users/agent-review` (super-admin via `app/(admin)/layout.tsx`). **Table:** `agent.review_queue` (single table — deliberately minimal, no RPCs, no satellites).

The one place agents register anything they built that Arman must go see/test (demo pages, new routes, feature surfaces), and where his feedback flows back to them. Kills the "finished feature rots undiscovered for weeks" failure. The agent-side contract (when to insert, status obligations, exact SQL) lives in **`.claude/skills/agent-review-queue/SKILL.md`** — that skill is the source of truth for agent behavior; this doc covers the surface.

## Parts

| Part | Path |
|---|---|
| Page (thin) | `app/(admin)/administration/users/agent-review/page.tsx` |
| Client + all logic | `features/admin/agent-review/components/AgentReviewClient.tsx` |
| Types | `features/admin/agent-review/types.ts` (row type from `Database["agent"]["Tables"]["review_queue"]`) |
| Migration | `migrations/agent_review_queue.sql` (applied + ledgered) |
| Nav | registered in `admin-categories.ts` ("Feedback" category) + `admin-navigation.ts` (Users → Communications) |

## Invariants

- **Data path is direct supabase-js** (`.schema("agent").from("review_queue")`), super-admin RLS (`public.is_super_admin()`). No API routes, no server actions, no Python.
- **`url` stores an app path** (`/demos/foo`) so links work on localhost and prod; absolute URLs only for external targets.
- **Status flow:** `pending` (agent) → `changes_requested` | `approved` (Arman, with `feedback`) → agent acts → `pending` again or `archived` (agent). Archived is hidden behind a toggle; agents own archiving — the queue must never rot.
- **"Copy for AI"** uses the shared `components/agent-copy` primitive, `kind: "agent-review-item"`, embedding the full row + current feedback text.
- **Do not grow the table.** New needs go in `metadata` jsonb or don't belong here — the existing feedback system (`users.user_feedback`) is the heavyweight tracker; this stays a 4-status queue.

## Change Log

- 2026-07-21 — Created: table + RLS, admin page, nav registration, `agent-review-queue` skill, CLAUDE.md pointer.
