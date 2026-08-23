---
type: Reference
title: "aidream error systems — the triage pass that replaces CURRENT_ERRORS.md"
description: "aidream has no CURRENT_ERRORS.md; it has durable in-app error systems (tool traces, system_error, write-failure replay, ops-triage, app_log, user_feedback). This is the per-system 'cleaned up =' definition and the order to work them."
tags: [errors, triage, aidream, observability]
timestamp: 2026-08-22T00:00:00Z
---

# aidream exception — error triage runs against the LIVE error systems, not CURRENT_ERRORS.md

aidream (the Python brain, `/Users/armanisadeghi/code/aidream`) has robust durable
error capture at many layers. **Do NOT create or use `CURRENT_ERRORS.md` there.**
The other three files (FOUND_DEFECTS.md, .matrx/AGENT_TASKS.md, .matrx/ARMAN_TASKS.md)
work exactly as the skill says. Whenever this skill would touch CURRENT_ERRORS in
aidream, run the **Error-systems triage pass** below instead.

Verified against live code 2026-07-12. If a pointer here is dead, fix this doc in the
same turn (context-docs discipline).

## The core philosophy (from the repo, not this skill)

A captured failure is usually a **harness defect** — a faulty tool, weak instructions,
a tool that doesn't follow the patterns agents expect, a missing primitive — i.e. a
codebase-improvement opportunity, not just an incident to dismiss. This is most
explicit for **tool-call failures**: most tool errors look like "the agent's fault"
but are really the harness's. Treat every recurring signature as a candidate
FOUND_DEFECTS entry or task promotion. Doctrine: PRINCIPLES.md ("extinction is
layered, and loud").

## Inventory — where errors live and how each gets cleaned up

### 1. Tool-call failures — `cx_tool_trace` + `.matrx-debug/` ⭐ (the one agents miss)
- **What:** every tool dispatch: `OK / FAIL / SURFACE_REJECT / NO_EXECUTOR / LOOP_BLOCK / COERCED / INFERRED`, plus `err_type` incl. `matrx_validation_gate` and `embedded_error_envelope` (a tool lying "success" over a failed payload).
- **Stores:** DB `chat.tool_trace` (durable, covers prod; written by `packages/matrx-ai/matrx_ai/tools/_db_log.py`) and flat files `.matrx-debug/tool-trace-*.log` (per server process; `_debug_log.py`).
- **Read/triage:** skills `/triage-tool-traces` (batch) + `/inspect-call` (one call_id); MCP `/mcp/debug-traces` + REST `/admin/debug-traces/*`; SessionStart hook `trace-check.sh` prints pending FAIL counts. Scheduled internal agents (Tool Trace Triage 4h, Pattern Detector weekly) exist via `scripts/register_trace_triage_schedules.py`.
- **Cleaned up =** run the triage skill: classify failures (Cat A extension bug → matrx-extend `PENDING-TASKS.md` Inbox; Cat B agent-side → report only; Cat C server/architecture → report + file; Cat D embedded-error-envelope → high priority, fix the tool), **delete processed log files** (that resets the "since last triage" window), let `scripts/prune_traces.py` age out DB rows (30d). Recurring/systemic signatures → FOUND_DEFECTS or a promotion proposal.
- **Remember:** `COERCED`/`INFERRED` aren't failures — they're the harness rescuing bad calls (`ARG_RECOVERY.md`); a spike in them still signals a tool schema that fights the agents' habits.

### 2. `public.system_error` — canonical non-write failure sink
Request crashes, stream crash/cancel, loud-recovery reports. Written only via `matrx_orm.record_error` (never raises). Review: dashboard `/persistence` → System Errors tab; REST `GET /persistence/errors`, `POST /errors/{id}/resolve` (+ batch). **Cleaned up =** resolve with a `resolution_note`; recurring kinds → FOUND_DEFECTS. Append-only, no pruner (intentional). Unification roadmap: `TASK-systemwide-error-tracking.md`.

### 3. `public.system_write_failure` — dropped DB writes (REPLAYABLE)
Coordinator-captured write drops (the 2026-05 data-loss fix). Review: `/persistence` → Write Failures tab; **replay** via `POST /persistence/failures/{id}/replay`, batch, or CLI `scripts/replay_write_failures.py` (dry-run by default, `--apply`). **Cleaned up =** replayed-and-recovered, or dismissed with reason. A write failure that replays cleanly but recurs = harness defect → file it. Skill: `matrx-persistence`.

### 4. `/ops-triage` — `ops_issue_class` / `ops_issue_event`
Classified governance alarms with dedup keys: env-validation gaps (boot), tool-result size-gate firings (`tool_result_overflow/ceiling/canary:{tool}` — each firing is BY CONTRACT a defect in the tool), wire-swap budget, reference governance. Review: dashboard `/ops-triage`; REST `/ops/summary`, `/ops/events/recent`, `/ops/issue-classes`. **Cleaned up =** set class `disposition` (`suppress` for noise / `monitor` / `escalate` / `alert`) + `resolution_notes`; events are append-only history. A `tool_result_*` class → the named tool needs `cap_text` + `output_self_capped` (see `TOOL_RESULT_SIZE_GATE.md`) — that's a task, not a suppress.

### 5. `public.app_log` — the durable log firehose
Everything stdlib/vcprint/uvicorn logs, 30d retention (`scripts/prune_app_logs.py`). Review: dashboard `/logs` (Unified/Raw/Unclassified/Patterns, Problems preset, collapse-identical, Copy-for-AI, correlation trails by request/conversation id). **Cleaned up =** mute noise signatures (runtime `app_log_muted_pattern`, reversible; errors always pass) and fix the sources of real ERROR patterns. No per-row resolve — it's a firehose, not a work queue. Contract: `aidream/observability/FEATURE.md`.

### 6. `public.user_feedback` — agent/human bug reports
Filed via the AI Dream MCP `feedback` tool (files as the caller; no agent id). Review: `feedback` tool `list` (admin sees all) / `get`; status defaults `"new"`. **Cleaned up =** status flipped off `new` after the underlying issue is fixed or re-filed. This is also where CLAUDE.md's "log it where every future agent trips over it" points.

### 7. Structured `error` columns on domain rows
Per-row outcome capture (`cx_message.error`, `cx_user_request.error`, `cx_tool_call` error state, `wf_run`/`workflow.node_outcome` errors, etc.) per `docs/persistence/STATUS_AND_ERROR_FIELDS.md`. Not a triage queue — but a hygiene pass that spots a *pattern* of failed rows (same error shape across many rows) files it as a defect. Never smuggle errors into `status`.

### 8. Watchdog / stuck rows
No table of its own — sweeps `pending→completed` lifecycles across cx_*/wf_*/file/extraction/etc. (`aidream/db/watchdog_configs.py`). Review: `/persistence` → Watchdog tab (`GET /persistence/watchdog`, `list_stuck_rows`). **Cleaned up =** stuck rows force-failed by predicates; a table that keeps going stuck = defect in its writer.

### 9. Domain-specific failure/retry queues (check only when the task touches them)
- `scraper.scrape_failure_log` / `scrape_quick_failure_log` / `scrape_retry_queue` (matrx-scraper)
- `rag.kg_sweep_queue` + `KgSweepRun` (matrx-rag)
- `public.mtx_media_heal_queue` (signed-URL leak healer; pg_cron drained)
- `app.error` (legacy per-app-definition errors, own resolve lifecycle), `system_personal_org_failures`
- `.matrx-debug/llm-io/` (auto-ingest exact LLM I/O recordings; per-run folders, no retention)

### 10. Proactive guards (errors caught BEFORE they're stored)
`scripts/release.sh` runs the validator battery (org scoping, tools/agents parity, envelope registry, type contracts, storage-uri isolation, actor-stamp columns on the error tables themselves, …). **Cleaned up =** the code is fixed so the guard passes; a guard that keeps re-firing is itself a defect entry.

## The Error-systems triage pass (replaces CURRENT_ERRORS steps in aidream)

Run during a full `/task-hygiene` sequence (in place of any CURRENT_ERRORS work) or on demand:

1. **Tool traces first** — if the SessionStart hook reported pending FAILs, run `/triage-tool-traces`. Systemic findings (faulty tool, bad instructions, pattern mismatch, uncapped output, envelope lie) → FOUND_DEFECTS or a promotion proposal. Delete processed files.
2. **`/persistence` sweep** — unresolved `system_error` rows: resolve trivia with notes, file recurring kinds. `system_write_failure`: dry-run replay, `--apply` the eligible class, dismiss-with-reason the rest, file any recurring drop source. Check the Watchdog tab for chronic stuck tables.
3. **`/ops-triage` sweep** — new active issue classes: suppress genuine noise (with notes), convert every `tool_result_*` and `environment` class into its prescribed fix (task/ask-Arman), escalate the rest.
4. **`/logs` Problems pass** — collapse-identical over the last few days of ERROR; mute confirmed noise; file real patterns with a Copy-for-AI excerpt as evidence.
5. **`user_feedback`** — list `status="new"`; each entry gets a home (fix now / defect / task proposal / ask-Arman), then flip its status.
6. **Reconcile** — everything filed lands in FOUND_DEFECTS / AGENT_TASKS / ARMAN_TASKS per the normal skill rules (promotion still needs Arman, ≤3 at a time). Every pass should leave each queue smaller or better-classified — never just "looked at it."

Arman can still paste a raw log dump in chat — triage it directly with the same
classification, using the correlation tools above (request_id/conversation_id trails)
instead of a standing inbox file.
