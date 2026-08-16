---
status: active
updated: 2026-08-15
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

- **Contract:** `common-docs/systems/coding-session-bridge/FEATURE.md`. Product completion:
  `common-docs/projects/ai-work-hub/PLAN.md`. Adapter delivery: `projects/coding-agent-bridge/PLAN.md`.
- **Backend:** `aidream/services/coding_session_bridge/` (service, orm_store, titles, claude_session_store,
  claude_managed_runtime + FEATURE.md); 9 MCP tools in `aidream/api/mcp/agent_service/`; REST
  `aidream/api/routers/coding_sessions.py` (incl. live `GET /coding-sessions/sessions` identity list).
- **Frontend:** `features/ai-work/` (+ FEATURE.md). Live: https://www.aimatrx.com/work/conversations,
  `/work/connections` (repo at `v0.4.708`). Focused chips: `.matrx/AGENT_TASKS.md` TASK-005…008.
- **Local:** `matrx-local/app/services/coding_sessions/`; desktop page `/claude-history`; signed
  `v1.4.26` installed and healthy. Title reconciliation is `TASK-003` (approved, P0).
- **Deploy:** aidream `./scripts/release.sh` (commit unrelated dirty files scoped first); verify
  `https://server.app.matrxserver.com/health/version` against origin/main. Frontend auto-deploys on push.
- **DB probes:** asyncpg + aidream `.env` (`SUPABASE_MATRIX_*`), `statement_cache_size=0` (pgbouncer).
- **Live state 2026-08-16:** 266 bindings (237 Claude, 29 Codex, all `event_mirror`) / 2 owners;
  workspace labels populate; **232 Claude rows now carry `claude_title` with
  `title_source=provider`, and the conversation title equals Claude's own sidebar label exactly on
  all 232**; `git_branch` and account fingerprint are still NULL on every live row (no bound session
  is a worktree run; event-mirror hooks cannot read the account — item 6). One `Auto:` placeholder
  remains and it is the stale half of a duplicate binding, not a missing title.
- **Operator checklists:** VS Code `matrx-vscode/OPERATOR_CHECKLIST.md` (+ `PUBLISHING.md`);
  managed Codex design `matrx-codex-plugin/docs/MANAGED_RUNTIME_PLAN.md`.

## Remaining work (priority order)

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
1. **~~Claude-native titles — Matrx Local producer (`TASK-003`)~~ — DONE 2026-08-16.** Arman's
   ruling: *"Those labels cannot be different. They must be exactly the same, and they must remain
   in sync. So if it's changed in Claude Code, we are able to update it in our system."* The join is
   Claude's own desktop session index
   (`Application Support/Claude/claude-code-sessions/<account>/<org>/local_*.json`), whose
   `cliSessionId` is the exact UUID the bridge already binds and whose `title` is the exact sidebar
   label — better than any JSONL-derived title. Shipped: `claude_session_index.py` (labels only, no
   raw path, newest-`lastActivityAt` wins across the cross-account union),
   `title_sync.py` + `POST /coding-session/claude/labels/sync` (aidream's owner-scoped identity list
   is the ALLOWLIST — an unmirrored session's label never leaves the machine; both binding forms
   resolve; V20 send-ledger makes an unchanged label free and a rename detected next pass), the
   import path preferring the index labels and queueing them behind the batches that mint the
   binding, and a desktop **Sync titles now** card. aidream now also observes `worktree_name` +
   `is_archived` (`provider_archived`) on `SessionMetadata`.
   **Live proof:** the shipped reconciler + durable outbox against production —
   235 bound sessions, **232 matched and delivered, 0 failed, 0 remaining**, second pass fully
   idempotent (`queued: 0, unchanged: 232`). Live DB: 232 rows carry `claude_title` with
   `title_source=provider`, and `chat.conversation.title` equals Claude's label **exactly on all
   232**. The 9 `Auto:` placeholder rows are down to **1**, and that one is the stale half of a
   duplicate binding (below), not a missing title. The 5 remaining untitled rows are 4 hosted-sandbox
   certification sessions that never ran on this Mac plus that duplicate — no local Claude record
   exists for any of them, which is honest, not a gap. `git_branch`/`worktree_name` stayed empty
   because zero of the 232 bound sessions are worktree runs; 234/234 carry a real `isArchived`
   (8 archived), which lands on the first shipped sync pass after the server change is live.
   **Follow-up filed (decision-gated, NOT done):** `chat.coding_session` has no unique constraint on
   `(created_by, provider, provider_session_id)` and one live pair exists —
   `2773ac14-a999-4db1-b430-2f5efd9f77c8` has two sessions and two conversations for one Claude
   session. `find_session` reaches only one, so the other can never be titled and permanently wears
   `Auto: Code Editor`. Merging live conversations is Arman's call; see aidream `FOUND_DEFECTS.md`.
2. **Managed-Claude launch and continuation (`TASK-006`).** Backend is production-CERTIFIED
   (start/stream/resume/cancel/fork). Consume capabilities + NDJSON + cancel in `/work/new` and
   conversation detail. Native Resume/Fork strictly capability-gated; everything else is a labeled
   seeded handoff, never a generic "Resume".
3. **~~AI Work composer + Saved Requests (`TASK-005`)~~ — DONE 2026-08-15.** `/work/new` ships the
   eight-step composer on real AI Matrx execution; `/work/requests` ships Saved Requests as
   `agent.shortcut` rows under one seeded category (no new table). The composer's destination slot
   exists and is capability-gated — item 2 is what makes a provider destination selectable.
   `/work/automations` and a workflow handoff are still absent; Timing doors into `/schedules/new`.
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

- Contract + two `chat` tables + owner-only RLS + four-provider event mirror — contract FEATURE.md.
- Claude plugin `0.2.0-alpha.6` (OAuth hooks, transcript locator, 16-partition asset sync), installed.
- Codex `v0.2.0-alpha.3` transport certified; Cursor `v0.2.0-alpha.2` real installed-release E2E to
  production certified; VS Code `v0.1.1` VSIX + Marketplace listing prepared.
- Matrx Local Claude history import + durable outbox + v2 cross-machine account identity, signed `v1.4.26`.
- `conversations` MCP tool live (list/search/get_summary/get_messages; `/matrx:conversations`).
- Managed Claude runtime production-CERTIFIED incl. the broker gzip/content-encoding fix — PLAN.md Lane 5.
- Durable session titles: first-prompt derivation + provider precedence ladder + `workspace_name`,
  with the historical placeholder backfill — aidream `titles.py`, `service.py`.
- AI Work Hub live: unified inbox, provider transcript with tool calls + load-earlier, associations,
  account grouping, capability facts, workspace chips — `features/ai-work/FEATURE.md`.

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
  old TASK-003 framing — the index `title` is the source, backfill + pull-sync cadence), and the
  /work/conversations overhaul (default list excludes the 4,613 `conversation_type='subagent'`
  internal machine runs, canonical table view, URL state for selection/sort/filter,
  provenance-labeled detail view, sync-state panel + Sync-now).
