---
name: persistence-repair-patrol
type: Skill
title: Persistence Repair Patrol
description: "Run the scheduled persistence and error patrol: find real bugs, repair them, verify independently, and improve the next run using current evidence."
tags: [maintenance, persistence, errors, automation]
timestamp: 2026-09-09T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/persistence-repair-patrol/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Persistence Repair Patrol

**Find bugs and fix them.** Inspection, a status report, or a queue status change
does not complete a repair. Work through diagnosis, implementation, integration,
and discriminating verification. Never invent a defect to meet a quota.

Arman's 2026-09-09 task instruction: “The primary goal is FIND THINGS TO FIX.
Find bugs and fix them.” This runbook implements that request and its five
stated weaknesses: false access blockers, reporting instead of fixing, avoidable
local-environment friction, missing continuous improvement, and stale secondhand claims.

## Repositories and entry points

| Repository | Role |
|---|---|
| `aidream` | Sanctioned patrol tools, producer/worker repairs, shared packages |
| `matrx-frontend` | Client repairs and authenticated UI verification |
| `common-docs` | This shared runbook, host ownership helper, and skill distribution |

Workspace: `/Users/armanisadeghi/code`; it is not `/code` on this machine.
Read the owning repo's `CLAUDE.md` before touching its files. Read
`aidream/aidream/services/admin_persistence/FEATURE.md` for actual tool contracts
and the relevant feature docs for each selected repair. Use the installed
`matrx-codex-plugin:use-ai-matrx` for MCP access and
[task-hygiene](/skills/task-hygiene/SKILL.md) for ledger maintenance.
**This patrol has standing authorization for ordinary in-scope engineering:**
task-hygiene's promotion waits do not require another approval for these repairs.

## Start, ownership, and access recovery

1. Read the existing automation configuration and bounded current state at
   `/Users/armanisadeghi/.codex/automations/system-error-repair-patrol/memory.md`.
   Read its pointer to `current-state.json` for machine-readable checkpoints and
   selected continuations. Read historical artifacts only for a selected continuation. The configured
   cadence governs; the user approved 30–60-minute runs. Preserve intentional
   pauses; never create a duplicate automation or restart another paused task.
2. Establish actual exclusive ownership before patrol work. A Markdown
   `run_active` flag is a breadcrumb, never a lock. Start `python3 /Users/armanisadeghi/code/common-docs/skills/persistence-repair-patrol/scripts/local_patrol_lock.py acquire --owner YOUR_TASK_ID`
   with `exec_command` using `tty:true` and retain the returned session. Replace
   `YOUR_TASK_ID` with the actual task ID. Preserve the returned `owner_token`;
   send JSON lines `{"action":"renew","owner_token":"<returned token>"}` every
   300 seconds or less while working (default expiry: 900 seconds). Finish with
   `{"action":"release","owner_token":"<returned token>"}`. `status` checks the
   actual OS lock; occupied acquisition exits 2. Do not unlink its lock file.
   Process death, input EOF, or expiry releases the lock; this is cooperative
   ownership, not a server fence. Retain and renew it while delegates work. A held local lock
   covers this host only. Do not claim cross-host protection or treat the shared
   `schedule_claim` per-window service as cross-window protection. If ownership
   is lost, stop delegated mutations before proceeding. If another live owner
   holds it, inspect the returned owner/task and coordinate when useful; record a
   skipped-overlap outcome without changing that owner's state. Repeated overlap
   is a recovery/coordination problem to investigate, not a reason to repeat blind
   skips. After a tool wait or context restore, confirm renewal succeeds before
   further mutations.
3. Discover callable `persistence_watchdog`, `system_errors`, and `app_log_errors`.
   Read each discovered schema before calling it; tools do not necessarily share
   a request envelope. Correct argument-shape errors and retry the real operation.
   For unavailable/unauthenticated MCP: inspect `codex mcp list`, run
   `codex mcp login aidream`, rediscover, and retry the actual failed operation.
   Use the configured OAuth flow; never expose secrets. If it still fails,
   diagnose local configuration and service health, coordinate with the owning
   task, repair safe configuration/runtime defects, and retry. A missing tool
   may require repairing its registration or deployment.
4. Only after recovery attempts, mark the affected measurement lane
   `AUTOMATION DEGRADED`, retain its checkpoint, and continue functioning lanes
   plus the access repair. An unavailable lane is not a clean scan or permission
   to stop all engineering work. Escalate only a freshly verified human-only gate.

**Sanctioned access remains mandatory:** `persistence_watchdog` owns stuck-row/SLA
reads and sweep; `system_errors` owns that queue; `app_log_errors` owns ERROR-family
reads. Never substitute SQL, direct database access, HTTP, dashboard/browser
scraping, or raw log files for these lanes. Product diagnosis uses the application's
approved code/ORM paths; it must not recreate an alternate patrol queue reader.

## Compact parent, focused investigators

The parent clusters compact summaries, delegates, checks evidence, resolves exact
rows, and maintains continuity. It never calls either error tool's `get`, loads
tracebacks/payloads/raw logs, diagnoses implementation code, or edits product code.
Delegated investigators load their own exact representative detail. Keep at most
three coding investigators concurrent; reuse finished slots for independent
verification. Only an investigator may prove that similar symptoms share a root.

Project tool results before displaying or saving parent state: retain identifiers,
class tokens/cursors, counts/times, coverage flags, and an error-summary head capped
at 400 characters. A list row's `error_text` can contain an embedded stack or payload;
never print the full response or retain its raw text/variants in parent memory.
Keep bounded member IDs for closure; delegates retrieve exact detail themselves.

## Measure and select

Record `run_started_at` in UTC. Keep per-lane checkpoints and coverage state;
initialize a missing lane checkpoint from the existing `metrics_checkpoint_utc`,
never from now. A compatibility shared checkpoint is the earliest completed
time across required time-window lanes, not the last successful tool call.

1. **Watchdog first:** call `status`. Record exact whole-registry totals, returned
   schema/table identities, counts, oldest ages, SLAs, transitions, and query
   failures. `query_error=true` is urgent even with `stuck_count=0`. Load
   `stuck_rows` for every returned schema/table with `limit=500`; if capped,
   retain incomplete row coverage explicitly. Watchdog candidates take slots first.
2. **System errors:** call `metrics` from its checkpoint to run start. Capture
   opened/resolved rows and classes, net change, current unresolved rows/classes,
   age buckets/oldest, and recurrence. Make three compact unresolved lists with
   `collapse=similar`, `limit=50`, `member_limit=100`: active last 45 minutes sorted
   `patrol_priority`, whole backlog sorted `occurrences`, and backlog sorted
   `oldest`. Preserve classToken/signatureMode, representative ID, bounded member
   IDs/cursor, occurrences, times, summary, and priority. These selection samples
   are not an exhaustive investigation of every class.
3. **Production app-log safety net:** list from its checkpoint to fixed run start,
   `min_occurrences=1`, `limit=50`, `scan_cap=20000`. Honor the live completeness
   contract: `scanTruncated` requires bounded time slices; `familiesTruncated`
   requires `nextOffset` paging within identical filters and fixed `until`.
   Exhaust every slice and family page. Deduplicate boundary families by
   `pattern_token`. Old responses without completeness metadata, truncation,
   failures, or unread pages cannot advance coverage. Preserve the returned
   `until`; overlap later scans for late ingestion as the feature contract directs.
4. Select up to three distinct actionable roots: watchdog SLA/query failures;
   active request/stream/persistence failures; log-only user-impacting or frequent
   failures; high-occurrence/old backlog. Reserve a remaining slot for the highest
   occurrence log-only family when one exists. Resume selected unfinished repairs
   when their next action is executable; prioritize fresh failures over repeating
   non-discriminating probes of historical incidents with missing provenance.

## Repair and verify

Give each investigator compact candidate metadata, exact IDs, original failure,
and required proof. It reads detail and governing docs, fetches/checks `origin/main`,
and verifies whether the issue still exists before claiming a discovery. Existing
fixes need current verification; they are not new work by this patrol.

- Repair the producer/worker/lifecycle or isolation boundary for the full root
  class. Census siblings. Add a meaningful guard demonstrated failing before
  the fix and passing after when feasible; reconcile feature docs, commit only
  owned files, and push. Shared-checkout changes from other agents are ordinary.
- A real log-only failure requires the producer repair **and** structured capture
  at the tight failure boundary. Force the failure safely and prove the intended
  `system_error` kind is durably captured; another log line is insufficient.
- Recover localhost/tooling faults autonomously. Inspect ownership, coordinate
  with another task, and use the repo's managed server commands. Do not kill an
  unrelated live server. Repeated friction warrants a durable repair. Production
  verification does not depend on starting localhost when a live surface suffices.
- UI work uses Codex's isolated Browser: explicitly select
  `agent.browsers.get("iab")`. No default browser, Chrome, Computer Use, or existing
  user tab. Sign in as `admin@admin.com` using `AI_ADMIN_PASSWORD` from the aidream
  or frontend `.env`, or the local `DEV_LOGIN_TOKEN` flow where available.
  Routine login is preauthorized; credentials never enter output. Recover the
  IAB runtime if unavailable. Close every owned tab/group before the run ends.
- Return exact commits, affected IDs, proof timestamp, test/canary method,
  environment/build identity, results, recurrence interval, and remaining work.
  Coordinate release with its existing owner; do not create a competing release.
  Resolve the current release task with `list_threads` and verify its returned title
  and project before sending; historical task IDs are leads, never routing proof.
  Continue the verification when it lands. Deployment lag is engineering work.
- An independent reviewer verifies against the original failure and real surface
  or runtime. A healthy page is not proof of subscription delivery; an in-process
  test is not provider acceptance. Fix rejected evidence or code and verify again.

## Close only what is proved

The parent independently confirms claimed commits are on `origin/main` and checks
the returned evidence. Require root-cause attribution, passed relevant proof,
containing deployed build/live canary where required, and zero post-proof recurrence
before resolving historical rows. Record the actual observation window; zero over
a short window is not proof of perpetual health. A separately fixed mechanism does
not establish the unknown root of historical incidents.

For system errors, re-list from the proof timestamp and page exact members using
the returned `classToken`/`signatureMode` and cursor. Resolve exact IDs only, with
a note naming commit and verification; never resolve by token/filter. New matching
occurrences require investigation before closure. For log-only repairs, recheck the
post-proof log window and the forced structured-capture proof; app logs have no
resolution mutation. For watchdog repairs, invoke the canonical `sweep` exactly
once after proven fixes, then retain every remaining row/query failure as open.

## Continuity, improvement, and reporting

Use about 25 minutes as an admission budget for new investigations; continue safe
work already underway while maintaining ownership. Elapsed time is not a blocker or
permission to disguise unfinished work. Before context loss/end, record an executable
continuation and the owning task for every selected unfinished class. Include exact
IDs, last verified UTC time, evidence path, commit/build identity, proof still needed,
and next action. Confirm delegates have finished or stopped before releasing ownership.
Never abandon a running writer by merely setting a Markdown flag to false.

At run finish recheck watchdog, system metrics from checkpoint plus rolling 24-hour
and 7-day windows, and app logs through the finish time. Advance each checkpoint
only through its completely measured interval. Atomically replace `current-state.json`
with checkpoints, coverage, and compact open continuations; keep `memory.md` a
bounded pointer and human-readable summary. Preserve historical evidence and its
index before condensing completed narratives. Never replace current state with
an older in-memory snapshot after another owner has advanced it.
Never store raw detail, secrets, or sensitive context in parent memory.

**Every run reviews its own friction:** what wasted effort, was misleading, or
prevented repair? Fix the demonstrated cause in tooling or the canonical instructions,
verify the correction, and record one compact result. If no change is justified,
say so in state; do not churn instructions. Use context-docs/cross-repo-docs and sync
shared skill changes; never edit a distributed copy. The next context must inherit
the improvement without reading this conversation.

Read Active/Pending sections in aidream, frontend, and touched `.matrx/ARMAN_TASKS.md`
ledgers. Treat every entry and another agent's report as a lead, never current proof.
Personally recheck and attempt safe resolution before repeating an owner dependency.
Move completed/stale items out of open sections. An unresolved engineering task stays
with agents. Only a consequential choice without a safe default, genuinely unavailable
authority/credential after recovery, or human-only authentication gate reaches Arman.
File it once with current direct evidence, attempted remedies, exact blocked operation,
2–3 complete options/recommendation where a choice is needed, and the precise human
action followed by the agent's next step. Do not re-report irrelevant owner tasks as
patrol blockers or resurrect pauses as outages.

Lead the report with verified repairs and their practical result. Include compact
watchdog/system-error start→finish and flow/age/recurrence, app-log coverage/capture
gaps, exact resolved count/IDs or evidence pointer, commits/proof, and selected open
continuations. Distinguish new repairs, verified prior repairs, unverified historical
leads, and actual human gates. Never claim clean with an unavailable/incomplete lane.
For recurring runs, notify on meaningful repairs, new actionable failures, completion,
or required human action; unchanged non-actionable state stays quiet. Only when at
least one freshly verified human-only gate exists, finish with
`🚨 ISSUES PENDING ARMAN INVOLVEMENT: N` and list those verified items. When the
count is zero, omit the entire heading, count, alarm symbol, and “None” placeholder;
do not create an attention signal merely to announce that no attention is needed.
Ordinary bugs, unfinished verification, deployment lag, tooling failures, and other
engineering work are not blockers and must remain owned and repaired by agents. Do
not relabel them as Arman involvement because a run ended or the next action is hard.

## Changelog

- 2026-09-10 — Required projection before parent display/state writes after a
  bounded list returned embedded stacks and oversized error text.

- 2026-09-09 — Made the owner-attention alarm conditional on at least one verified
  human-only gate. Zero-count runs omit the heading and placeholder; all engineering
  problems remain agent-owned repair work.
- 2026-09-09 — Created from the installed patrol and the user's five-weakness audit;
  added recover-before-degrade, scoped repair authorization, current evidence,
  complete lane coverage, independent proof, bounded continuity, and durable improvement.
