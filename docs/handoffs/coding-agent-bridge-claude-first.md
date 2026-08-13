---
status: active
updated: 2026-08-13
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
  precedence rules). Delivery status lives in the two PLAN.md files above — both groomed 2026-08-12.
- **Backend:** `aidream/services/coding_session_bridge/` (service, orm_store, claude_session_store,
  claude_managed_runtime + FEATURE.md); MCP tools in `aidream/api/mcp/agent_service/` (9 tools incl.
  `conversations`, `coding_session_bridge`, `sync_claude_assets`); REST `aidream/api/routers/coding_sessions.py`.
- **Frontend:** `features/ai-work/` (+ FEATURE.md) — inbox, provider transcript, connections;
  `features/agent-connections/coding-sessions/`. Live: https://www.aimatrx.com/work/conversations,
  /work/connections (v0.4.497).
- **Local:** `matrx-local/app/services/coding_sessions/` (durable outbox, Claude history import,
  account keys) + desktop page `/claude-history`; release `./scripts/release.sh --message "..."`.
- **Deploy:** aidream `./scripts/release.sh` (commit unrelated dirty files scoped first if it
  complains); verify `https://server.app.matrxserver.com/health/version` vs origin/main. Frontend
  releases auto-deploy on push (Vercel project `prj_ZIeMm2FW8RgOAO9BJgQ2YQcXpwrH`).
- **DB probes:** asyncpg + aidream `.env` (`SUPABASE_MATRIX_*`), `statement_cache_size=0` (pgbouncer).
  Tables: `chat.coding_session`, `chat.coding_session_entry`, projection into `chat.conversation/message/tool_call`.
- **Managed-runtime certification evidence:** ai-work-hub PLAN.md Lane 5 (paid PASS table, 2026-08-12).
- **Sandbox:** hosted orchestrator `https://orchestrator.dev.codematrx.com`, `template=aidream`
  image auto-rebuilds on aidream main (`matrx-sandbox/scripts/deploy-hosted.sh`).

## Remaining work (priority order)

1. **Claude-native label/metadata parity** — an agent is mid-flight on this (verify, don't redo):
   live sessions must carry Claude's OWN title (JSONL `customTitle`/`aiTitle`/`summary` — reader
   exists in `matrx-local/app/services/coding_sessions/claude_history.py:_read_summary`) plus
   git branch, via a Matrx Local reconciliation through the existing bridge. Title precedence:
   user-set > provider > first-prompt > placeholder (`retitle_placeholder_conversation` in
   `orm_store.py` currently upgrades placeholders only — needs a `title_source` marker). Record the
   verified pin verdict (Claude Code local data has no pin concept) in the contract so the question
   stays answered. Backfill existing ~75 sessions after deploy.
2. **Managed-Claude launch/stream UI** — backend is CERTIFIED (start/stream/resume/cancel/fork).
   Build `/work/new` destination + conversation-detail continue: ensure/create the user's hosted
   `template=aidream` sandbox (existing FE plumbing `lib/sandbox/orchestrator-routing.ts`,
   `app/api/sandbox/[id]/access-tokens/route.ts`), POST `{proxy}/api/coding-sessions/claude/stream`
   (NDJSON), wire cancel, gate on `GET /coding-sessions/claude/capabilities`. Never a generic
   "Resume" — capability-gated wording only.
3. **Reconnect / authorized-account UX** — `/work/connections` still can't name the authorized
   AI Matrx account or repair a wrong-account OAuth without CLI (ai-work-hub "OAuth-owner incident",
   exit gates 3–4).
4. **Multi-account live-path identity** — imported sessions carry deterministic v2 account keys
   (matrx-local `derive_account_key`); live event-mirror sessions still carry NO account identity
   (hook can't read it). Design the honest live-path stamp (e.g., Matrx Local companion or plugin
   command hook running `claude auth status`), then prove the four-accounts-one-inbox flow.
5. **Recorded installed-import certification** — Matrx Local v1.4.23 Claude History sync works;
   run + record a formal installed-release certification, then let AI Work surface the action
   directly (today it links to the desktop app).
6. **`/work/new` composer + Saved Requests** — ai-work-hub Lanes 4/8 (AI Matrx destination first;
   inventory shortcuts/apps/schedules before any new table; retired prompt tables are banned).
7. **Seeded handoff UX** — cross-provider/cross-account continuation with explicit fidelity verdict
   (`conversations` MCP `get_summary` already returns a `seeded_handoff` block).
8. **Operator items (Arman/ops):** nested-bwrap privileges on hosted Docker for the full Bash tool
   profile; aidream-template volume reseed gap on sandbox recreate; both tracked in aidream
   `FOUND_DEFECTS.md`.
9. **Secondary providers** — three chips run in separate sessions (Codex re-cert + managed-runtime
   plan; Cursor authenticated E2E + marketplace prep; VS Code Marketplace prep + manual
   `vscode://` operator check). Public marketplace publication for all adapters afterward, Claude
   plugin first. Codex-equivalent conversation-MCP flow.

## Done

- Contract + two `chat` tables + owner-only RLS + four-provider event mirror — see contract FEATURE.md.
- Claude plugin `matrx--v0.2.0-alpha.5` (OAuth mcp_tool hooks) + 16-partition asset sync — matrx-claude-plugin.
- Codex `v0.2.0-alpha.3`, Cursor `0.2.0-alpha.1`, VS Code `v0.1.0-alpha.3` adapters — their repos.
- Matrx Local Claude History import + durable outbox + v2 cross-machine account identity (v1.4.23) — matrx-local.
- `conversations` MCP tool live (list/search/get_summary/get_messages; `/matrx:conversations`) — aidream v0.2.39.
- Managed Claude runtime production-CERTIFIED incl. broker gateway content-encoding fix — aidream v0.2.39–41, PLAN.md Lane 5.
- Real titles from first prompt + `workspace_name` stamp + 70-row backfill — aidream v0.2.41.
- AI Work Hub live: unified inbox, provider transcript with tool calls + load-earlier, associations,
  account grouping, capability-gated launch entry, workspace chips — frontend v0.4.481→497, features/ai-work/FEATURE.md.

## Decisions needed

- **Situation:** Sessions mirrored before 2026-08-11 are owned by a different AI Matrx account
  (the plugin was OAuth'd to it at the time); they will never appear in the current account's
  inbox. **Decide:** leave them with the owning account (current behavior), or perform a one-time
  verified ownership transfer of those ~20 rows to the main account.
