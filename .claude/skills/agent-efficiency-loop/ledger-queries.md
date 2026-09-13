---
type: Reference
title: "agent-efficiency-loop — ledger queries"
description: "The SQL that turns an agent run into numbers: per-run cost and calls, the waste census, stuck rows, cache ratio, and a poll that knows when a run has really finished. All against the chat ledger (chat.conversation / chat.request / chat.tool_call)."
tags: [agents, efficiency, sql, ledger]
timestamp: 2026-09-12T00:00:00Z
---

# agent-efficiency-loop — ledger queries

Contents: §1 baseline per run · §2 waste census · §3 per-request tokens and cache · §4 stuck rows ·
§5 polling a run to its real end · §6 pitfalls that produced wrong numbers.

Every platform agent run is one `chat.conversation` (title `Auto: <agent name>`,
`conversation_type='subagent'` when launched through `agent_run`), N `chat.request` rows (one per
model turn, with `cost`, `input_tokens`, `cached_tokens`, `output_tokens`) and M `chat.tool_call`
rows (`tool_name`, `arguments`, `output`, `output_chars`, `status`, `is_error`, `error_message`).
Run these through the Supabase MCP or psycopg with `prepare_threshold=None` (the pooler).

## §1 Baseline — one row per run

```sql
select c.id, c.created_at,
       round(sum(r.cost)::numeric, 3)                                   as cost,
       count(distinct r.id)                                             as turns,
       (select count(*) from chat.tool_call t where t.conversation_id = c.id)                   as calls,
       (select count(*) from chat.tool_call t where t.conversation_id = c.id and t.is_error)    as errors,
       (select count(*) from chat.tool_call t where t.conversation_id = c.id
                                            and t.status in ('pending','running'))            as open_rows,
       (select left(content::text, 160) from chat.message m
         where m.conversation_id = c.id and m.role = 'user' order by created_at limit 1)         as launch_message
from chat.conversation c
join chat.request r on r.conversation_id = c.id
where c.title ilike 'Auto: <agent name>%' and c.created_at > now() - interval '7 days'
group by c.id, c.created_at
order by c.created_at;
```

Never join `chat.request` and `chat.tool_call` in the same `sum(cost)` — the join multiplies the
cost by the number of tool calls (a $0.75 run read as $15.74 on 2026-09-12).

## §2 Waste census — every call of one run

```sql
select tool_name, status, is_error, output_chars,
       left(arguments::text, 240) as args,
       left(coalesce(error_message, output::text), 160) as out
from chat.tool_call
where conversation_id = '<run id>'
order by created_at;
```

Read the whole list. Mark: unfiltered reads (no `match`, big `limit`), the same `data` written in
N calls, retries of an identical call, reads whose output the agent used two fields of, a docs
read that returned a stub, and a `self_prompt`/instruction edit that is not the last call.

## §3 Per-request tokens and cache

```sql
select iteration, round(cost::numeric, 3) as cost, input_tokens, cached_tokens, output_tokens,
       tool_calls_count, left(raw_usage::text, 160) as raw
from chat.request
where conversation_id = '<run id>'
order by created_at;
```

Healthy: `cached_tokens` grows every turn and uncached `input_tokens` stays small. A turn where
cached drops to zero means the prefix changed mid-run (an instruction edit, a system-prompt
change) — move that edit to the last call.

## §4 Stuck rows — lost completion writes

```sql
select count(*) filter (where status = 'pending' and created_at < now() - interval '10 minutes') as stale_pending,
       count(*) filter (where error_type = 'watchdog_timeout')                                     as watchdog
from chat.tool_call
where created_at > now() - interval '1 day';
```

Any non-zero number is a platform defect, not agent behaviour (see LESSONS.md, the coordinator
late-write fix).

## §5 Polling a run to its real end

The launcher (`agent_run` through MCP) times out long before a multi-minute run ends; the run
continues server-side. Poll the ledger instead:

```python
# psycopg, autocommit, prepare_threshold=None (pgbouncer)
# every 30 s: running = count(tool_call where conversation_id=X and status='running')
#             mc      = conversation.message_count
# done when running == 0 and mc unchanged for 3 polls and mc >= 4
```

Find the run by launch time and the first user message, never by "latest conversation with this
title" — other sessions launch the same agent.

## §6 Pitfalls that produced wrong numbers

| Pitfall | What it did |
|---|---|
| `sum(cost)` over a request×tool_call join | ×21 cost |
| `last_request_status` as a "done" signal | flips per turn; false positives |
| psycopg with default prepared statements on the pooler | `prepared statement "_pg3_2" does not exist` |
| `'%Auto: X%'` with an empty params tuple in psycopg | `%A` parsed as a placeholder |
| Counting the latest conversation as yours | another session's repair run was read as my run |
