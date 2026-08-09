---
name: agent-review-queue
description: Register anything you built that Arman must go see/test in the UI, read feedback, and route repair work by primary lane, required tools, ownership, and verification state. Use at the END of any task that produced something reviewable, at the START of a task to check prior feedback, and when coordinating or claiming review repairs. One table (agent.review_queue), written via the Supabase MCP; the human side is /administration/users/agent-review. Cross-repo — aidream/matrx-extend agents use the same table with their own source value.
---

# Agent Review Queue — get your work seen, get feedback back

**The failure this kills:** agents build things, mention them mid-message, Arman misses it, and finished features rot undiscovered for weeks. The queue at `/administration/agent-review` is the ONE place he checks. If you built something he must look at and you didn't register it, assume it will never be seen.

## Everything is LIVE — never write deployment status into a row

**All agent code auto-merges to `main` and deploys within ~30 minutes; branches are then deleted. There is no such thing as not-yet-live code.** Arman only ever reviews the live app — by the time he opens a row, your work IS deployed, so any "not deployed yet" claim is false the moment he reads it.

- **Instructions describe the live app, period.** Never mention PR numbers, branches, "merge first", "pending release", "review after deploy", "RETEST AFTER DEPLOY", or any deploy caveat. Don't claim "deployed"/"verified live" either — deployment status simply does not appear.
- **Don't spend instructions on PR handling.** Nobody reviews PRs; they auto-approve and merge. Wondering what to do with your PR is wasted work.
- A row that leads with deploy caveats is a defect — it burns his review on a false premise.
- `metadata.origin.branch`/`commit` stay — that's provenance, not a status claim.

## When to add an item (end of task)

Add a row when you produced **anything reviewable in the UI that Arman didn't explicitly walk through with you live**: a demo page, a new route, a reworked surface, an admin panel, a feature needing validation/approval. Skip it only when the work has no UI surface, or Arman already reviewed it in this conversation.

One row per reviewable thing. Registering is one INSERT via the Supabase MCP (project `txzxabzwovsujtloxrus`). Include the versioned triage envelope so a repair coordinator can route the item later without rereading prose. `required_tools` is intentionally multi-label; do not force a database + browser repair into one false either/or bucket.

```sql
insert into agent.review_queue (title, url, instructions, source, metadata) values (
  'Short human title of the thing',
  '/demos/my-new-thing',            -- app PATH, not absolute URL (works on localhost + prod); absolute only for external targets
  'What to click, what to look for, and what feedback you need. 2-6 sentences. Be specific — he tests exactly what you say.',
  'ai-matrx',                       -- your repo: ai-matrx | aidream | matrx-extend | matrx-local
  jsonb_build_object(
    'origin', jsonb_build_object(
      'agent_label', '<your stable agent/task label>',
      'thread_id', '<thread id when available>',
      'branch', '<branch when applicable>',
      'commit', '<deployed commit when applicable>'
    ),
    'triage', jsonb_build_object(
      'version', 1,
      'lane', 'browser_ui',
      'required_tools', jsonb_build_array('browser', 'frontend_code', 'authenticated_session'),
      'workstreams', jsonb_build_array('responsive_ui', 'accessibility', 'verification'),
      'priority', 'normal',
      'assignment', jsonb_build_object('mode', 'origin_agent', 'state', 'ready'),
      'verification', jsonb_build_object(
        'browser_breakpoints', jsonb_build_array('desktop', 'tablet', 'mobile'),
        'notes', 'Re-run the instructions against the deployed target.'
      )
    )
  )
);
```

Allowed values are defined and runtime-validated in `features/admin/agent-review/triage.ts`:

- Primary lane: `browser_ui | code_only | database_data | backend_api | deployment | cross_system | human_required`
- Required tools: `browser | frontend_code | backend_code | database | deployment | authenticated_session | external_service | human_input`
- Assignment state: `ready | claimed | blocked | fixing | verifying | awaiting_review`
- Priority: `critical | high | normal | low`

Then say in your final message that you registered it, with the title.

## Statuses — the contract

| status              | meaning                                                                | who moves it                                            |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `pending`           | Needs Arman's review                                                   | you, on insert (and after fixing, to re-request review) |
| `changes_requested` | Feedback in `feedback`; repair work is routed/claimed through metadata | Arman                                                   |
| `approved`          | Approved; do any follow-through, then archive                          | Arman                                                   |
| `archived`          | Done. Hidden from the queue                                            | **you**, after handling feedback                        |

## Reading your own feedback (start of task)

```sql
select id, title, url, status, feedback, feedback_at, metadata from agent.review_queue
where status in ('changes_requested','approved') and source = 'ai-matrx'
order by feedback_at desc;
```

- `changes_requested` → claim it before work, make the changes, verify them, then set `status='pending'`, `assignment.state='awaiting_review'`, and replace `instructions` with what changed and what to re-check.
- `approved` → finish any follow-through (wire it in, remove the demo, etc.), then `set status='archived'`.
- **The queue must never rot.** Handling a row's feedback ends with YOU updating that row — re-request review or archive. Never leave a handled item sitting in `changes_requested`/`approved`. If a demo is superseded or deleted, archive its row.
- Arman may also paste a row at you via "Copy for AI" (`kind: agent-review-item`) — treat the embedded `feedback` as the instruction, then update the row per the rules above.

## Repair coordination — claim by lane and tool

Use the original agent when `metadata.origin.thread_id` or another stable identity exists and the repair is context-heavy. Use a coordinator with specialist agents when origin identity is absent, the backlog is large, or tasks require distinct tool access. `source` names a repository, **not an agent**, so it is not enough to route work back to the original author.

The current legacy backlog should be coordinator-owned because old rows did not record agent identity. A good coordinator delegates by capability, while preserving one end-to-end owner per row:

1. Implementation specialist claims and fixes one row.
2. Specialist records evidence and moves assignment state to `verifying`.
3. A browser/DB/deployment verifier performs the required checks and records `verification.verified_by`, `verified_at`, and notes.
4. Only then does the coordinator return the row to `pending` for human re-review.

Find work requiring a specific tool (JSONB containment is indexed later if volume ever warrants it; at this queue size a direct query is sufficient):

```sql
select id, title, url, source, feedback, metadata->'triage' as triage
from agent.review_queue
where status = 'changes_requested'
  and metadata->'triage'->'required_tools' @> '["browser"]'::jsonb
  and metadata->'triage'->'assignment'->>'state' = 'ready'
order by
  case metadata->'triage'->>'priority'
    when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4
  end,
  feedback_at;
```

Claim exactly one matching row without racing another agent:

```sql
with candidate as (
  select id
  from agent.review_queue
  where status = 'changes_requested'
    and metadata->'triage'->>'lane' = 'browser_ui'
    and metadata->'triage'->'required_tools' @> '["browser"]'::jsonb
    and metadata->'triage'->'assignment'->>'state' = 'ready'
  order by feedback_at
  for update skip locked
  limit 1
)
update agent.review_queue as queue
set metadata = jsonb_set(
  jsonb_set(
    jsonb_set(queue.metadata, '{triage,assignment,state}', '"claimed"'::jsonb),
    '{triage,assignment,owner}', to_jsonb('<stable agent/task label>'::text)
  ),
  '{triage,assignment,claimed_at}', to_jsonb(now())
)
from candidate
where queue.id = candidate.id
returning queue.*;
```

If this returns zero rows, another worker got there first or no matching item is ready. Do not take an already claimed row unless the coordinator deliberately reassigns it.

## Verification handoff

Before returning a repaired item to human review, update the existing triage envelope rather than overwriting unrelated metadata. Required evidence depends on `required_tools`:

- `browser`: test the declared breakpoints and the actual interaction path, using a signed-in session when declared.
- `database`: verify the live row/RLS/RPC result, not just a migration or fixture file.
- `deployment`: verify the production URL and deployed version; a branch or local build is not reviewable.
- `external_service`: use a deterministic fixture when a paid/destructive call is unsafe, and say exactly what was not exercised.

The verifier records their stable label in `verification.verified_by`. Prefer a verifier different from `assignment.owner` for high/critical work. Oversight remains explicit: agents repair and verify; Arman is still the only person who approves or requests another round.

## Rules

- **This queue, not prose.** A "please test /demos/foo" buried in a chat message is the anti-pattern — register it.
- **No deployment status, ever** — see "Everything is LIVE" above.
- Don't duplicate: before inserting, check for an existing row with the same `url` — update its `instructions` and reset to `pending` instead.
- Never infer ownership from `source`; it is only the repository identifier.
- UI lives at `features/admin/agent-review/` (see its `FEATURE.md`). The table is deliberately minimal — do NOT add columns, RPCs, or satellite tables to it. Extend the versioned `metadata.triage` contract.
