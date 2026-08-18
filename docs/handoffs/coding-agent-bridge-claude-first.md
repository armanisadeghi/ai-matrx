---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream, matrx-local, matrx-claude-plugin, matrx-codex-plugin, matrx-cursor-plugin, matrx-vscode, matrx-sandbox, common-docs]
vision:
  - /Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md
  - /Users/armanisadeghi/code/common-docs/projects/coding-agent-bridge/PLAN.md
  - /Users/armanisadeghi/code/common-docs/systems/coding-session-bridge/FEATURE.md
---

# Coding Agent Bridge / AI Work Hub — Claude-first completion

## Vision — Arman's words

- "Harness the power of Claude Code inside of AI Matrx, but then at the same time, sort of do the
  same thing going in reverse." "Take conversations from Claude Code and have them in AI Matrx so
  that they're stored and they can be tracked… and share them across sessions and users."
- "As quickly as possible, I want to have a usable product… that I can start using on a day-to-day
  basis starting today." "Focus on the product first… don't waste any time on things that are
  afterthoughts such as security and compliance."
- "Can we get the conversations from multiple different Claude Code sessions for different
  accounts?… four different accounts that I own and have all my conversations come to the same
  place and make sure that they bring with them if they're pinned or not, and if they are
  categorized in any way. And then for me to be able to manage that. Then can I trigger a new task
  directly from our system so that it starts running in Claude Code?"
- "The missing label or title and the horrible 'Auto: Code Editor' is the biggest massive bug
  because it's not only false, it's a massive lie!"
- "We need to make sure that we are building for VS Code and Cursor as well. But again, our number
  one is going to be Claude Code." Secondary providers never block the Claude path.
- Binding milestone order and the vocabulary that may never be blurred — event mirror / pull sync /
  native / seeded handoff — plus the multi-account and state-reconciliation laws: ai-work-hub
  PLAN.md "Owner rulings (2026-08-12)".

## Resources

- **Contract:** `common-docs/systems/coding-session-bridge/FEATURE.md`. **Behavior bar (READ
  FIRST for any UX/identity/runtime work): `common-docs/systems/coding-session-bridge/BEHAVIOR.md`**
  — MUST-behave rules for accounts, capture, the local runtime, the provider-cloud verdict, and
  Arman's step-by-step verification script. Product completion:
  `common-docs/projects/ai-work-hub/PLAN.md`. Adapter delivery: `projects/coding-agent-bridge/PLAN.md`.
- **Backend:** `aidream/services/coding_session_bridge/` (service, orm_store, titles, claude_session_store,
  claude_managed_runtime + FEATURE.md); 9 MCP tools in `aidream/api/mcp/agent_service/`; REST
  `aidream/api/routers/coding_sessions.py` (incl. live `GET /coding-sessions/sessions` identity list).
- **Frontend:** `features/ai-work/` (+ FEATURE.md). Live: https://www.aimatrx.com/work/conversations,
  `/work/connections`, `/work/new` with the "Claude Code on my Mac" destination and the native
  Continue panel (repo at `v0.4.771`). Browser→Mac relay: `features/ai-work/lib/matrxLocalRuntime.ts`
  over the per-user Supabase Broadcast channel `matrx-local-bridge:<userId>`.
- **Local:** `matrx-local/app/services/coding_sessions/` incl. `local_runtime.py` (start/resume/
  cancel/stream on the user's machine, native mirror, E2E-proven against production 2026-08-17 —
  `scripts/_verify_local_claude_runtime_e2e.py`) + `capture_reconciler.py` (15-min backfill +
  quarantine); engine handlers `app/api/coding_runtime_handlers.py`; desktop Agent Runtime card on
  the Claude History page. Signed `v1.4.33` installed.
- **Deploy:** aidream `./scripts/release.sh` (commit unrelated dirty files scoped first); verify
  `https://server.app.matrxserver.com/health/version` against origin/main. Frontend auto-deploys on push.
- **DB probes:** asyncpg + aidream `.env` (`SUPABASE_MATRIX_*`), `statement_cache_size=0` (pgbouncer).
- **Live state 2026-08-17:** capture is flowing again (verify before trusting: newest
  `chat.coding_session_entry.created_at` must be minutes old during active coding). Claude titles
  equal Claude's own sidebar labels via provider title sync; the capture reconciler is draining the
  discovered backfill (160/200 recent sessions had never been delivered; one poisoned outbox row
  had stalled delivery for four days — now quarantined). Event-mirror rows still carry no account
  identity (hooks cannot read it); runtime-launched sessions are `native/matrx_local`. One `Auto:`
  placeholder remains — the stale half of the known duplicate binding.
- **Operator checklists:** VS Code `matrx-vscode/OPERATOR_CHECKLIST.md` (+ `PUBLISHING.md`);
  managed Codex design `matrx-codex-plugin/docs/MANAGED_RUNTIME_PLAN.md`.

## Remaining work (priority order)

00. **🚨 Capture durability — BUILT 2026-08-17 on Arman's approval. Remaining: watch the drain.**
    The reconciler (matrx-local `app/services/coding_sessions/capture_reconciler.py`) backfills
    Claude sessions the hook path never delivered, using the EXISTING importer and the EXISTING
    outbox — no second transport was added. It runs every 15 min as launcher task
    `claude_capture_reconciler`; `POST /coding-session/claude/capture/reconcile?dry_run=true`
    reports the diff without enqueuing.

    **What the live diff found, and it is worse than the one outage:** 235 sessions in the cloud
    against 815 local session files, with **160 of the 200 most recent local sessions never
    delivered at all** (all inside the mirroring era, all substantial — 198 of those 200 have 5+
    user turns). Underneath that sat a second failure: the durable outbox had been **hard-stuck
    since 2026-08-13** on one row that failed **2,520 times** with HTTP 409 `entry_mutated`,
    blocking **3,709 rows for four days**. Ordered delivery plus infinite retry equals a permanent
    stall; terminal rejections are now quarantined (preserved, never dropped) so the queue advances.

    **Open follow-ups, in order:**
    - **Confirm the backlog fully drained** and the backfilled sessions landed:
      `sqlite3 ~/.matrx/matrx.db "select count(*) from coding_session_bridge_outbox"` → 0, and
      `select count(*) from chat.coding_session where provider_session_id like 'claude-sdk:%'`
      climbing. At ~1 row/sec the four-day backlog takes about an hour of engine uptime.
    - **Inspect the one quarantined row** (`coding_session_bridge_quarantine`) and decide whether
      that event is recoverable or is correctly abandoned. A non-zero count means real events are
      permanently absent from the platform.
    - **Find out WHY 160 sessions were never captured.** The reconciler now repairs the symptom, but
      a hook path that loses 80% of recent sessions is a defect in its own right and the reconciler
      must not become the excuse not to fix it.
    - **Desktop surface:** the capture status/reconcile routes have no UI yet; `ClaudeHistorySync.tsx`
      is the natural home.
    - Optional, independent, small: `BridgeHealth` carries no owner-level delivery facts, so a health
      call without `provider_session_id` cannot say when anything last arrived. Adding
      `last_observed_at` would let `/matrx:health` state the gap numerically as well as from the
      attach receipt. Not required — the receipt check already decides.

0. **🚨 CONVERSATION MANAGEMENT + WAR ROOM INTEGRATION FIRST (Arman, 2026-08-15).** Before VS Code
   and distribution work: "the way they're managed is a disaster… they need to be fully integrated
   into the war room" so war-room agents "have awareness of these conversations and are able to
   search them", plus "a series of tools that makes it easy to search these conversations" and
   custom analysis agents (user-vision extractor, end-result summarizer, and more). **Shipped
   2026-08-15:** registered platform tool `conversations` (list/search/get_summary/get_messages
   over `chat.conversation` incl. coding mirrors, owner-strict, search snippets —
   `aidream/tools/conversations_tool.py` over `conversation_browse.py`); all three War Room slot
   agents armed with it; five analysis agents live via the agent-builder
   (`conversation_vision_extractor`, `conversation_outcome_summarizer`,
   `conversation_action_auditor`, `conversation_decision_ledger`, `conversation_drift_auditor` —
   category `conversation-analysis`, each armed with `conversations`, vision extractor verified
   end-to-end against a real mirrored Claude Code session). **Still open on this front:** product
   surfaces to RUN the analysis agents from `/work/conversations` rows and war-room conversation
   attachments (one-click "Extract vision / Summarize outcomes / Audit drift" via the assists
   registry or row actions); thread-level conversation placement from the Hub (PLAN.md Lane 3);
   FTS/tsvector on `chat.message` when ILIKE stops scaling; persisting analysis outputs somewhere
   durable (note/association on the conversation) instead of one-off run output.
1. **One Claude session wears two bindings, and one half can never be titled (decision-gated).**
   `chat.coding_session` has no unique constraint on `(created_by, provider, provider_session_id)`,
   and one live pair exists: `2773ac14-a999-4db1-b430-2f5efd9f77c8` has two sessions and two
   conversations for a single Claude session. `find_session` reaches only one, so the other is
   permanently stuck on `Auto: Code Editor` — it is the last placeholder row in the system. Adding
   the constraint is mechanical; **merging two live conversations is Arman's call.** See aidream
   `FOUND_DEFECTS.md`.
1b. **Titles must sync BOTH ways (Arman, 2026-08-16; chipped).** *"The Claude Code title is what we
    should use for our label. And when our conversations go to Claude Code, or if I update this,
    then the Claude Code value should be updated to match."* Inbound is done (above); the return
    path — an AI Matrx rename writing back to Claude's own session index — is not built. It writes
    into another application's data, so it is Matrx-Local-only, single-field, atomic, fenced against
    concurrent Claude writes, allowlisted to bound sessions, and must not fight the server ladder
    (an AI Matrx rename becomes `title_source=user`, which inbound sync must then respect).
2. **Managed-Claude launch and continuation (`TASK-006`).** The LOCAL half SHIPPED and was
   production-proven 2026-08-17: matrx-local's `local_runtime.py` starts/natively-resumes/cancels
   Claude Code on the user's own Mac (own installed CLI + subscription login; API-key env
   precedence blanked), persists through the certified import path into the native ledger at turn
   boundaries, and is reachable from the browser over the EXISTING `matrx-local-bridge:<userId>`
   Broadcast rpc channel (`coding_runtime.*`). Frontend doors live: `/work/new` destination
   "Claude Code on my Mac" (live-gated + approved-folder picker) and the provenance view's
   capability-gated `ContinueOnMyMacPanel` (native resume only when Claude's own transcript +
   workspace exist locally). Desktop: Agent Runtime card (approvals, runs, Stop) on the Claude
   history page. E2E evidence: `matrx-local/scripts/_verify_local_claude_runtime_e2e.py`
   (production binding `7b5bbe22-0613-5b02-b455-c754adf1b55d`, native, entries 10→17 across
   resume, cancel settled). **Remaining in TASK-006:** the HOSTED sandbox lane's launch UI
   (capabilities + NDJSON + cancel from `/work/new`), live-token streaming to the browser
   (today the canonical conversation advances at turn boundaries — mid-turn realtime needs
   either faster mirror passes or an event relay), a "Continue on my Mac" chip on the
   conversations ROW menu (the door currently lives one click in, on the provenance view the
   row opens), and native fork. Note: continuing a hook-mirrored (event_mirror, raw-UUID)
   session natively mints the composite-identity native binding → its own conversation (the
   known dual-binding item 1); the panel reports where turns land.
3. **`/work/automations` and the workflow handoff are still absent.** The composer and Saved
   Requests shipped (see Done); Timing currently doors into `/schedules/new`, and a Saved Request
   cannot yet be attached to a workflow or an app event. Reuse the existing durable workers and
   triggers — never a second automation engine.
4. **One-click installed history reconciliation (`TASK-007`).** Certify installed Matrx Local
   `v1.4.26`, then make **Sync Claude Code now** reach preview/import/status/retry/discard and
   report exact inspected/imported/updated/duplicate/conflict/unsupported counts.
5. **Authorized-account and reconnect UX (`TASK-008`).** Name the authorizing AI Matrx account
   separately from delivered-session provenance; supported disconnect/re-authorize/test for Claude.
6. **Multi-account identity on the LIVE path.** Imported sessions carry deterministic v2 account
   keys; event-mirror sessions carry none (the hook cannot read the account), so the
   four-accounts-one-inbox goal is unproven for live sessions. Design the honest stamp, then prove it.
7. **Codex mirrors nothing today (chip fired).** Transport, OAuth, outbox and replay are certified,
   but Codex silently skips hooks that lack persisted hook trust and `codex exec` hosts never see
   the `/hooks` prompt — so an empty list reads as "nothing happened" instead of "untrusted".
   Needs a real detector, honest UI status, docs, and Arman running `/hooks` once per host.
8. **Hosted sandbox reseed (chip fired).** Every managed-Claude certification needed manual
   in-box patching (stale baked working copy, missing `/var/log/aidream`) — open in aidream
   `FOUND_DEFECTS.md`. Managed Claude is not a product feature until a fresh box just works.
9. **Distribution.** VS Code is packaged and listing-ready — remaining work is Arman's ~40 minutes
   in `OPERATOR_CHECKLIST.md` (manual `vscode://` proof, then publisher ID + PAT + `vsce publish`).
   Cursor needs a public repo or team plan for its marketplace, plus one desktop MCP OAuth. Claude
   plugin public publication remains.
10. **Managed Codex/Cursor runtimes.** File-level design exists for Codex
    (`MANAGED_RUNTIME_PLAN.md`, three write boundaries: matrx-local, matrx-sandbox, aidream).
    Cursor's headless CLI still emits only session start/end — host-dependent, not our defect.
11. **Automation and import breadth.** Saved Requests through existing schedules/workflows/events;
    ChatGPT stays an explicit export-import archive lane, never a claimed live history API.

## Done

- Conversations table made usable — honest `last_activity_at` in `cvx_list_scoped` (default sort,
  indexed), compact icon columns at the table primitive, title chip removed. Doctrine + measurements:
  `features/ai-work/FEATURE.md`, `components/official/matrx-data-table/FEATURE.md`,
  `lib/list-views/FEATURE.md`. **`updated_at` is a row-mutation stamp, never activity.**
- Silent-capture detection + loud recovery — `captureGapVerdict()` / `<CaptureGapAlert>` graded
  against the owner's own cadence, plus a `/matrx:health` that actually proves attachment; see
  `features/agent-connections/coding-sessions/` and matrx-claude-plugin.
- `/work/conversations` overhaul: honest default scope, provider/app columns, organization panel.
- Claude-native titles inbound — Matrx Local reads Claude's desktop session index and delivers labels
  through the bridge; 232 rows match Claude's sidebar exactly. See
  `matrx-local/app/services/coding_sessions/` (`claude_session_index.py`, `title_sync.py`).
- Durable title ladder (user > provider > first_prompt > placeholder) + `workspace_name` — aidream
  `services/coding_session_bridge/titles.py`.
- AI Work composer `/work/new` + Saved Requests `/work/requests` on `agent.shortcut` (no new table).
- Conversation management + War Room: registered `conversations` tool, War Room agents armed, five
  conversation-analysis agents — `aidream/tools/conversations_tool.py`.
- Ownership consolidation executed (Arman's ruling): all 68 admin@admin.com sessions moved.
- Contract + two `chat` tables + owner-only RLS + four-provider event mirror — contract FEATURE.md.
- Claude plugin `0.2.0-alpha.6`; Codex `v0.2.0-alpha.3` transport certified; Cursor `v0.2.0-alpha.2`
  real installed-release E2E; VS Code `v0.1.1` packaged and listing-ready.
- `conversations` MCP tool live (`/matrx:conversations`) — aidream.
- Managed Claude runtime production-CERTIFIED incl. the broker gzip fix — ai-work-hub PLAN.md Lane 5.
- AI Work Hub live: unified inbox, provider transcript with tool calls, associations, account
  grouping, capability facts — `features/ai-work/FEATURE.md`.

## Ground truth about Claude Code's local store (measured 2026-08-16 — cite this, stop re-asking)

The desktop app keeps its EXACT sidebar metadata in per-account session index records:
`~/Library/Application Support/Claude/claude-code-sessions/<accountUuid>/<orgUuid>/local_<id>.json`
(4,222 records inspected on Arman's Mac). Every record has: `title` (the sidebar label; `titleSource`
on ~40%), `cliSessionId` (→ transcript `~/.claude/projects/<cwd-slug>/<cliSessionId>.jsonl`),
`cwd`/`originCwd` (the folder), `isArchived`, `model`, `effort`, `permissionMode`,
`createdAt`/`lastActivityAt`/`lastFocusedAt`, `completedTurns`, `spawnedFrom` (spawn lineage);
sometimes `branch`/`worktreePath`/`worktreeName`, PR fields, `scheduledTaskId`.
**There is NO pinned/starred/favorite/tag/category field anywhere in the store** — pinning cannot be
synced because Claude Code does not persist it. Arman's multi-account visibility script
(`~/.claude/sync-claude-code-sessions.py`, doc `~/.claude/CLAUDE-CODE-SESSION-SYNC.md`) is an
additive pointer-merge across account folders — audited 2026-08-16: it cannot create duplicates in
our DB (dedup is `(created_by, provider, provider_session_id)`; the only 2 historic cross-account
duplicates predated it and are merged).

- **2026-08-16 ownership consolidation (Arman's ruling executed):** all 68 admin@admin.com coding
  sessions + conversations/messages/tool_calls/raw entries transferred to arman@armansadeghi.com;
  the 2 cross-account duplicate provider sessions merged (richer copy kept, thin copy soft-deleted).
  Live: 264 sessions, ONE owner, zero duplicate provider_session_ids.
- Chips fired 2026-08-16: Claude-native title sync from the desktop session index (supersedes the
  old TASK-003 framing — the index `title` is the source, backfill + pull-sync cadence).
- **/work/conversations overhaul — DONE 2026-08-16.** Honest default (machine runs excluded by a
  visible, counted, clearable filter), canonical entity-list table on the new `cvx_list_scoped` RPC
  family, URL state for scope/search/filters/sort/page, provenance-labeled detail for EVERY
  conversation (not just mirrors), and a per-account sync-state panel. **Table notes (2026-08-16
  follow-up):** the activity column is `last_activity_at`, never `updated_at` (which is a
  row-mutation stamp and is now the hidden "Last modified"); the default sort is `last_activity`;
  the star is a `compact` icon column owned by the table primitive; and there is no per-row title
  provenance chip. See
  `features/ai-work/FEATURE.md`. **The one thing NOT done is a real Sync-now**, and the reason is
  structural, not cosmetic: matrx-local's `/coding-session/claude/history/*` routes are (a) on a
  locally scanned port (`MATRX_PORT_BASE` 22140+) the browser cannot discover, (b) unreachable
  through the only web→desktop relay we run — aidream `/api/local-proxy/{app_instance_id}/{path}`
  hard-rewrites to `{tunnel_url}/sandbox/{path}` — and (c) carry no auth guard, so exposing them
  over the tunnel as-is would be wrong. TASK-007 is therefore: add a `/coding-session/*` lane to
  the local-proxy (or a dedicated aidream endpoint) AND authenticate those desktop routes; the web
  button is already in place and states this exact boundary.
