---
name: agent-review-queue
description: Register anything you built that Arman must go see/test in the UI — demo pages, new routes, feature surfaces, admin panels — and read his feedback back. Use at the END of any task that produced something reviewable that Arman didn't watch you build, whenever you create a page under (dev)/demos or any new route, and at the START of a task to check for feedback on prior items ("check the review queue", "any feedback for me?"). One table (agent.review_queue), written via the Supabase MCP; the human side is /administration/agent-review. Cross-repo — aidream/matrx-extend agents use the same table with their own source value.
---

# Agent Review Queue — get your work seen, get feedback back

**The failure this kills:** agents build things, mention them mid-message, Arman misses it, and finished features rot undiscovered for weeks. The queue at `/administration/agent-review` is the ONE place he checks. If you built something he must look at and you didn't register it, assume it will never be seen.

## When to add an item (end of task)

Add a row when you produced **anything reviewable in the UI that Arman didn't explicitly walk through with you live**: a demo page, a new route, a reworked surface, an admin panel, a feature needing validation/approval. Skip it only when the work has no UI surface, or Arman already reviewed it in this conversation.

One row per reviewable thing. Registering is one INSERT via the Supabase MCP (project `txzxabzwovsujtloxrus`):

```sql
insert into agent.review_queue (title, url, instructions, source) values (
  'Short human title of the thing',
  '/demos/my-new-thing',            -- app PATH, not absolute URL (works on localhost + prod); absolute only for external targets
  'What to click, what to look for, and what feedback you need. 2-6 sentences. Be specific — he tests exactly what you say.',
  'ai-matrx'                        -- your repo: ai-matrx | aidream | matrx-extend | matrx-local
);
```

Then say in your final message that you registered it, with the title.

## Statuses — the contract

| status | meaning | who moves it |
|---|---|---|
| `pending` | Needs Arman's review | you, on insert (and after fixing, to re-request review) |
| `changes_requested` | Feedback in `feedback` column; act on it | Arman |
| `approved` | Approved; do any follow-through, then archive | Arman |
| `archived` | Done. Hidden from the queue | **you**, after handling feedback |

## Reading feedback + your obligations (start of task)

```sql
select id, title, url, status, feedback, feedback_at from agent.review_queue
where status in ('changes_requested','approved') and source = 'ai-matrx'
order by feedback_at desc;
```

- `changes_requested` → make the changes, then `update agent.review_queue set status='pending', instructions='Round 2: <what changed / what to re-check>' where id=…`.
- `approved` → finish any follow-through (wire it in, remove the demo, etc.), then `set status='archived'`.
- **The queue must never rot.** Handling a row's feedback ends with YOU updating that row — re-request review or archive. Never leave a handled item sitting in `changes_requested`/`approved`. If a demo is superseded or deleted, archive its row.
- Arman may also paste a row at you via "Copy for AI" (`kind: agent-review-item`) — treat the embedded `feedback` as the instruction, then update the row per the rules above.

## Rules

- **This queue, not prose.** A "please test /demos/foo" buried in a chat message is the anti-pattern — register it.
- Don't duplicate: before inserting, check for an existing row with the same `url` — update its `instructions` and reset to `pending` instead.
- UI lives at `features/admin/agent-review/` (see its `FEATURE.md`). The table is deliberately minimal — do NOT add columns, RPCs, or satellite tables to it.
