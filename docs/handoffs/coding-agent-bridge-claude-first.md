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
  because it's not only false, it's a massive lie!" (fixed for first-prompt titles; Claude-native
  label parity is the top remaining item)
- "We need to make sure that we are building for VS Code and Cursor as well. But again, our number
  one is going to be Claude Code." Codex/Cursor/VS Code run as background lanes, never blocking
  the Claude path.
- Binding milestone order + vocabulary (event mirror / pull sync / native / seeded handoff) and
  the multi-account + state-reconciliation laws: ai-work-hub PLAN.md "Owner rulings (2026-08-12)".

## Resources

- **Contract:** `common-docs/systems/coding-session-bridge/FEATURE.md` (frozen envelope, tables,
  precedence rules). Product completion lives in `common-docs/projects/ai-work-hub/PLAN.md`.
- **Backend:** `aidream/services/coding_session_bridge/` (service, orm_store, claude_session_store,
  claude_managed_runtime + FEATURE.md); MCP tools in `aidream/api/mcp/agent_service/` (9 tools incl.
  `conversations`, `coding_session_bridge`, `sync_claude_assets`); REST `aidream/api/routers/coding_sessions.py`.
- **Frontend:** `features/ai-work/` (+ FEATURE.md) — inbox, provider transcript, connections;
  `features/agent-connections/coding-sessions/`. Live: https://www.aimatrx.com/work/conversations,
  `/work/connections` (current repo/release `v0.4.703`). Focused chips:
  `.matrx/AGENT_TASKS.md` `TASK-005` through `TASK-008`.
- **Local:** `matrx-local/app/services/coding_sessions/` (durable outbox, Claude history import,
  account keys) + desktop page `/claude-history`; signed `v1.4.26` is installed and healthy.
  Native-title reconciliation is chipped as Matrx Local `TASK-003`.
- **Deploy:** aidream `./scripts/release.sh` (commit unrelated dirty files scoped first if it
  complains); verify `https://server.app.matrxserver.com/health/version` vs origin/main. Frontend
  releases auto-deploy on push (Vercel project `prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH`).
- **DB probes:** asyncpg + aidream `.env` (`SUPABASE_MATRIX_*`), `statement_cache_size=0` (pgbouncer).
  Tables: `chat.coding_session`, `chat.coding_session_entry`, projection into `chat.conversation/message/tool_call`.
- **Managed-runtime certification evidence:** ai-work-hub PLAN.md Lane 5 (paid PASS table, 2026-08-12).
- **Claude plugin:** private `0.2.0-alpha.6` at `dd6673e`, tagged, pushed, installed, and enabled;
  `UserPromptSubmit` now carries the owner-only transcript locator required by title reconciliation.
- **Sandbox:** hosted orchestrator `https://orchestrator.dev.codematrx.com`, `template=aidream`
  image auto-rebuilds on aidream main (`matrx-sandbox/scripts/deploy-hosted.sh`).

## Remaining work (priority order)

1. **AI Work composer + Saved Requests (`TASK-005`)** — ship `/work/new` with AI Matrx execution
   first, composing existing agents, skills, context, files, associations, schedules, and workflows.
2. **Managed-Claude launch and continuation (`TASK-006`)** — consume the certified capability,
   NDJSON, and cancel contracts in `/work/new` and conversation detail. Native Resume/Fork is
   capability-gated; every other continuation is labeled seeded handoff.
3. **One-click installed history reconciliation (`TASK-007`)** — certify installed Matrx Local
   `v1.4.26`, then make **Sync Claude Code now** reach preview/import/status/retry/discard and report
   exact inspected/imported/updated/duplicate/conflict/unsupported results.
4. **Claude-native title/branch reconciliation (Matrx Local `TASK-003`)** — emit the existing
   `SessionMetadata` observation for mirrored/imported sessions. The reader, backend precedence,
   and plugin transcript locator are shipped; the Local reconciliation consumer is missing.
5. **Authorized-account and reconnect UX (`TASK-008`)** — name authorization separately from
   delivered-session provenance and provide supported disconnect/re-authorize/test for Claude first.
6. **Secondary providers and distribution** — managed Codex/Cursor runtimes, stable-format bulk
   imports when available, marketplace publication, and the installed VS Code native-URI check.
7. **Automation and import breadth** — Saved Requests through existing schedules/workflows/events;
   explicit ChatGPT export import remains an archive lane, not a live ChatGPT-history API.

## Done

- Contract + two `chat` tables + owner-only RLS + four-provider event mirror — see contract FEATURE.md.
- Claude plugin `matrx--v0.2.0-alpha.6` (OAuth hooks, transcript locator, conversations, 16-partition asset sync) — matrx-claude-plugin.
- Codex `v0.2.0-alpha.3`, Cursor `v0.2.0-alpha.2`, VS Code `v0.1.1` adapters — their repos.
- Matrx Local Claude History import + durable outbox + v2 cross-machine account identity; signed `v1.4.26` installed — matrx-local.
- `conversations` MCP tool live (list/search/get_summary/get_messages; `/matrx:conversations`) — aidream v0.2.39.
- Managed Claude runtime production-CERTIFIED incl. broker gateway content-encoding fix — aidream v0.2.39–41, PLAN.md Lane 5.
- Real titles from first prompt + `workspace_name` stamp + 70-row backfill — aidream v0.2.41.
- AI Work Hub live: unified inbox, provider transcript with tool calls + load-earlier, associations,
  account grouping, capability facts, and workspace chips — `features/ai-work/FEATURE.md`.

## Decisions needed

- **Situation:** Sessions mirrored before 2026-08-11 are owned by a different AI Matrx account
  (the plugin was OAuth'd to it at the time); they will never appear in the current account's
  inbox. **Decide:** leave them with the owning account (current behavior), or perform a one-time
  verified ownership transfer of those ~20 rows to the main account.
