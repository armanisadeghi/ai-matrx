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
- **Live state 2026-08-15:** 258 bindings / 307 mirrored conversations / 2 owners; workspace labels
  populate (208 matrx-frontend, 29 at the code root); `claude_title`, `git_branch`, and account
  fingerprint are all still NULL on every live row; 9 conversations keep the `Auto:` placeholder and
  all 9 have zero projected user messages.
- **Operator checklists:** VS Code `matrx-vscode/OPERATOR_CHECKLIST.md` (+ `PUBLISHING.md`);
  managed Codex design `matrx-codex-plugin/docs/MANAGED_RUNTIME_PLAN.md`.

## Remaining work (priority order)

1. **Claude-native titles/branches — Matrx Local producer (`TASK-003`, chip fired).** The whole
   server side is live, deployed and tested (`SessionMetadata` observation + user > provider >
   first_prompt > placeholder precedence); the plugin ships the transcript locator; Matrx Local
   already READS Claude's `customTitle`/`aiTitle`/`gitBranch` and then discards them into the
   preview screen only. ~5 files to join them, plus carrying the same fields on the `append_native`
   import path. Backfill the existing sessions afterward and report whether the 9 promptless
   placeholder rows have a Claude-side title (if not, choose an honest fallback label — the
   placeholder is the exact string Arman called a lie).
2. **Managed-Claude launch and continuation (`TASK-006`).** Backend is production-CERTIFIED
   (start/stream/resume/cancel/fork). Consume capabilities + NDJSON + cancel in `/work/new` and
   conversation detail. Native Resume/Fork strictly capability-gated; everything else is a labeled
   seeded handoff, never a generic "Resume".
3. **AI Work composer + Saved Requests (`TASK-005`).** AI Matrx execution first, composing existing
   agents, skills, context, files, associations, schedules, workflows. Retired prompt tables are
   not candidates; inventory shortcuts/apps/schedules before proposing any new table.
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

## Decisions needed

- **Situation:** About 20 sessions mirrored before 2026-08-11 belong to a different AI Matrx account,
  because the Claude plugin was authorized to that account at the time. They are real sessions and
  they will never appear in the main account's inbox. **Decide:** leave them with the account that
  owns them (current behavior), or run a one-time verified ownership transfer to the main account.
