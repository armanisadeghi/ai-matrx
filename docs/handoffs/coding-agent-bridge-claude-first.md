---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream, matrx-local, matrx-claude-plugin, matrx-codex-plugin, matrx-cursor-plugin, matrx-vscode, matrx-sandbox, common-docs]
vision:
  - /Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md
  - /Users/armanisadeghi/code/common-docs/projects/coding-agent-bridge/PLAN.md
  - /Users/armanisadeghi/code/common-docs/systems/coding-session-bridge/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/systems/coding-session-bridge/BEHAVIOR.md
---

# Coding Integrations — THE feature handoff (all packages, UI, services)

**This is the ONE document for the whole coding-integration feature.** Arman's ruling
(2026-08-19): the owner of this feature owns EVERYTHING that touches it — every adapter repo, the
bridge backend, the AI Work UI, Matrx Local, the sandbox lane — and above all the INTEGRATION
between them. Parts that don't talk to each other are this handoff's defects even when each part
individually "works". Verified ground truth below is from a three-way full-feature sweep on
2026-08-19 (code + live production DB + live MCP), not from prior docs.

## Vision — Arman's words

- "Harness the power of Claude Code inside of AI Matrx… and do the same thing going in reverse."
  "Take conversations from Claude Code and have them in AI Matrx so they're stored and tracked…
  and share them across sessions and users."
- "The whole point of the system is to connect to the Claude Code session on my computer… the
  difficult part is kicking off that first agent." Then: hand a browser conversation back to
  local Claude.
- "Can we get the conversations from multiple different Claude Code accounts… all come to the
  same place… bring with them if they're pinned or not, and if they are categorized."
- "The Claude Code title is what we should use for our label. And when our conversations go to
  Claude Code, or if I update this, then the Claude Code value should be updated to match."
- "Keeping the list of conversations clean and accurate is a massive and critical issue… if these
  'accidents' ever happen again, I would want us to have a feature that can detect and clean them
  up, either automatically, manually or both."
- "We need to make sure we are building for VS Code and Cursor as well. But again, our number one
  is going to be Claude Code." Secondary providers never block the Claude path.
- Global-view ruling (2026-08-19): "if there's six different parts to a system and we're building
  the parts but the parts aren't talking to each other yet and we're missing the main layer on
  top… someone needs to be aware of that." That someone is the owner of THIS document.

## The global map — every component and its state (2026-08-19)

| Component | Where | State | Proof |
|---|---|---|---|
| Contract + raw ledger + projection | aidream `services/coding_session_bridge/` + 2 `chat` tables | LIVE, deployed `c29d5fe59` | 802 sessions, 282,725 entries, newest 1s old |
| Claude event mirror (hooks) | matrx-claude-plugin `0.2.0-alpha.6` | LIVE | 327 event_mirror sessions; capture-gap alert on 3 pages |
| Claude history import + backfill | matrx-local (importer, `capture_reconciler.py`) | LIVE; 160-backfill done (150 ok / 10 dead-lettered by design) | 146 imported sessions in cloud |
| Titles: Claude → AI Matrx | matrx-local `title_sync.py` + aidream ladder | LIVE | conversation titles = Claude sidebar labels |
| Titles: AI Matrx → Claude (return) | matrx-local `claude_label_writer.py` | SHIPPED, manual-only (desktop "Sync titles now"; no background loop) | proof `aidream/scripts/_verify_claude_label_return_sync.py` |
| LOCAL Claude runtime (start/resume/cancel) | matrx-local `local_runtime.py` + Broadcast bridge + composer/Continue panel | LIVE and heavily used | **146 native/matrx_local sessions**, newest today |
| Hosted (sandbox) Claude runtime | aidream `claude_managed_runtime.py` | Backend CERTIFIED; **UI-orphaned** — `/claude/stream`+`/cancel` have zero callers | disabled placeholder button only |
| Conversations MCP tool + platform tool | aidream (`conversations`, `conversations_tool.py`) | LIVE; **search+provider filter BROKEN** (reproduced 2026-08-19) | feedback `2f29a244`, still `new` |
| Conversation-analysis agents (5) | aidream mandates + `ConversationAnalyzePanel` | LIVE on both detail views (2 clicks from inbox) | mandate-resolved, LiveRunWindow |
| AI Work UI (inbox/search/organize/compose/requests/connections) | matrx-frontend `features/ai-work` | LIVE (v0.4.845) | six journeys: 5 work, launch-watchability partial |
| Codex event mirror | matrx-codex-plugin `0.2.0-alpha.3` + Matrx Local | Transport certified; **hooks untrusted on real hosts = mirrors nothing**; quarantine fix on main UNRELEASED (CHANGELOG "Unreleased") | 329 codex sessions are smoke/loopback-era |
| Cursor adapter | matrx-cursor-plugin `0.2.0-alpha.2` | Certified E2E to production (2026-08-12); **distribution-orphaned** (needs public repo or team plan) | repo frozen since 08-12 |
| VS Code extension | matrx-vscode `v0.1.1` VSIX | Built+certified+packaged; **blocked ~7 days on Arman's 40-min publish checklist** | `OPERATOR_CHECKLIST.md` |
| Duplicate-binding protection | DB | **FIXED**: partial unique index live, the one pair merged 2026-08-16 | zero duplicate pairs |
| Outbox durability | matrx-local **v1.4.38** (`15b35f723`, `90d930061`, `dc092789d`) | Publisher no longer dies (4 wedge causes fixed, verified live); route latency 330 s → 0.30 s. **Queue still not draining** — blocked on MXL-D-079 (large-envelope TLS failure), 23,413 rows pending | local sqlite + access.log + process sample, 2026-08-19 |
| Codex stable-event-id stability | matrx-codex-plugin | **DEFECT**: one `UserPromptSubmit:<turn_id>` emitted with 16 different payloads in one session → server `entry_mutated`, 88 rows permanently quarantined | quarantine table, 2026-08-19 |

## Resources

- **Behavior bar (read FIRST):** `common-docs/systems/coding-session-bridge/BEHAVIOR.md` — MUSTs
  for identity/capture/runtime, provider-cloud verdict (no user-subscription cloud triggering;
  Anthropic Managed Agents is the only credible future cloud destination), Arman's verification
  script. Baseline says v1.4.33; nothing in v1.4.34/35 contradicts a MUST.
- **Contract:** `common-docs/systems/coding-session-bridge/FEATURE.md`. Product plan:
  `common-docs/projects/ai-work-hub/PLAN.md`. Adapter plan: `projects/coding-agent-bridge/PLAN.md`.
- **Backend:** `aidream/services/coding_session_bridge/` (+ `ownership.py` server-side org
  resolution, bounded checkpoint reads, `mandates.py`); MCP `api/mcp/agent_service/`; REST
  `api/routers/coding_sessions.py`.
- **Frontend:** `features/ai-work/` (+FEATURE.md — has drift, see item 8); browser→Mac relay
  `lib/matrxLocalRuntime.ts` over Broadcast channel `matrx-local-bridge:<userId>`.
- **Local:** `matrx-local/app/services/coding_sessions/` (runtime, importer, reconciler, title
  sync both ways, label writer, workspace discovery); engine handlers
  `app/api/coding_runtime_handlers.py`; desktop pages ClaudeHistorySync (capture UI shipped
  `e0894b257`) + Agent Runtime card.
- **DB probes:** asyncpg + aidream `.env` `SUPABASE_MATRIX_*`, `statement_cache_size=0`. Local
  outbox: `sqlite3 ~/.matrx/matrx.db "select count(*) from coding_session_bridge_outbox"`.
- **Deploy:** aidream `./scripts/release.sh`; matrx-local `./scripts/release.sh --message` (signed);
  frontend on push. Verify prod: `https://server.app.matrxserver.com/health/version`.

## Remaining work (priority order)

1. **DONE-with-a-successor (2026-08-19): the app is on v1.4.35 and the wedge was NOT fixed by it.**
   The updater installed 1.4.35 and the engine now reports it. **v1.4.35 did not drain the
   outbox** — it fixed the v1.4.34 crash (an ack-write exception raising out of the tick) but
   left the post-delivery writes on the shared aiosqlite connection, where they lost to the codex
   hook burst with `database is locked`. Ack, delete, AND deferral all failed, the loop
   `continue`d, and outbox row 72184 was re-POSTed to aidream **48 times** while the outbox grew
   21,636 → 22,126. Because `sync_pending` holds `_sync_lock` for the whole tick, this starved
   every coding-session route: `/coding-session/status` median **1,040 s**,
   `/coding-session/hooks` median **330 s**, `/health` 0 ms.
   **Fixed in matrx-local `15b35f723`, released as v1.4.36** — retirement now runs on a private
   `BEGIN IMMEDIATE` connection (the same durable boundary the hook ingress uses), and a
   delivered row is never uploaded twice. Regression:
   `matrx-local/tests/unit/test_coding_session_delivered_row_wedge.py`.
   - **The "codex lanes are starved / attempts=0" question is CLOSED — it was never a lane bug.**
     The publisher only ever touches lane HEADS, so of 22,126 queued rows exactly **219** were
     ever eligible to be attempted; `attempts=0` on the other 21,907 is correct by design. Lane
     isolation (`be04a6038`) worked throughout. Codex dominates only because Claude Code hooks
     deliver directly (109 claude_code rows vs 22,017 codex).
   - **Latency is fixed and verified:** `/coding-session/hooks` went from a 330 s median to
     **0.30 s**, `/coding-session/status` from 1,040 s to ~2 s, immediately after v1.4.36 booted.
   - **Three more incarnations of the same failure shape were found and fixed after v1.4.36**,
     each verified live on Arman's machine within minutes of the previous release:
     **v1.4.37** (`90d930061`) — a raw `ssl.SSLError: SSLV3_ALERT_BAD_RECORD_MAC` was not
     classified by `AIDreamClient`, sailed past `except (AIDreamOfflineError, AIDreamError)`, and
     killed the tick; and **v1.4.38** (`dc092789d`) — `_record_failure` still ran on the shared
     aiosqlite connection, so it raised `database is locked` *from inside the exception handler*
     and killed the tick again. Every outbox mutation (enqueue, retire, defer, record-failure,
     quarantine) now runs on the private `BEGIN IMMEDIATE` boundary, quarantine's copy-then-delete
     is atomic, and an unexpected error degrades to one deferred row instead of a dead publisher.
     **On v1.4.38 the publisher no longer dies** — zero new tick failures.
   - **STILL NOT DRAINING — new, separate root cause: `matrx-local` MXL-D-079.** Large envelopes
     (the stalled lane head is a run of 155-330 KB rows; largest pending is 2.6 MB) fail TLS
     *inside the engine process* with `SSLV3_ALERT_BAD_RECORD_MAC`, while `curl` to the same host
     from the same machine succeeded 6/6 at ~50-130 ms. Because a TLS failure is classified
     `AIDreamOfflineError` and offline deliberately `break`s the whole tick as "publisher-wide",
     ONE big row at the oldest lane head starves all 226 lanes. Small envelopes deliver fine.
     Also filed: **MXL-D-080**, watchfiles pegging ~2 CPU cores in the engine (`/health` 1 ms
     while every DB-touching route degrades to 10-60 s), which plausibly stops httpx timeouts
     firing promptly. Neither root cause is identified; both are filed, not fixed.
   - **The 88 quarantined rows are correctly abandoned, not recoverable as-is** (all codex
     `UserPromptSubmit`, all HTTP 409 `entry_mutated`, quarantined 08-17/08-18). Root cause is
     upstream in matrx-codex-plugin: the same `UserPromptSubmit:<turn_id>` was emitted with
     **different bytes** repeatedly within ONE session — one id has 16 rows with 16 distinct
     payload hashes, another 13, another 10. The server stored the first version and refuses the
     rest, which is correct. The plugin's own client-side quarantine caught the same class
     locally (6 poison files, `stable hook event identity was reused with a different envelope`).
     **The real fix belongs in matrx-codex-plugin: make the stable event id a function of the
     payload, or stop mutating a turn's payload after first emit.** Re-sending the 88 as-is fails
     forever; minting new ids would duplicate turns. They are preserved, never deleted.
2. **Make a launched local run WATCHABLE (chip fired).** Launch works (146 sessions!) but the
   mirror detail view has zero realtime/poll/refresh — "watchable while it runs" is only true
   across manual reloads. The composer's post-launch door bug (landed users on a blank /chat/new)
   was fixed 2026-08-19 (`5648f6d3b`). Remaining: live updates on `/work/conversations/[id]`
   while a run is active + honest copy.
3. **Fix `conversations` search+provider (chip fired).** Reproduced: search+provider fails while
   each alone works; nested Subquery composition in `conversation_browse.py` ~L348-395 is the
   suspect; the tool also swallows the real exception (its own defect). Feedback `2f29a244`.
4. **Schedule-prefill dead end.** Composer links `/schedules/new?agentId&prompt` and claims
   prefill; `ScheduleForm` reads neither param. Either consume them (small) or stop claiming.
   Part of the automations lane: `/work/automations` + Saved Request → workflow handoff absent.
5. **Hosted lane — RULED BUILD (2026-08-20), and the 2026-08-21 sandbox map found the hard
   blocker (chips fired):** the new internal `development` sandbox is **EC2-tier-only**
   (matrx-sandbox `routes/sandboxes.py:93-105`, host `matrx-sandbox-host-dev`), while managed
   Claude is **hosted-tier-only** by an explicit gate — coding_session_bridge `FEATURE.md:232`:
   EC2 capability probes return unavailable "until that tier has a separately reviewed container
   isolation profile". Resolving that gate (review bwrap/socat isolation on the `development`
   image, then deliberately open EC2 tier) is the prerequisite for "run the cloud environment in
   the dev sandbox". Also: the hosted endpoints' 08-15 "certification" has NO in-repo record and
   predates the AWS/Cloudflare migration — treat as unre-certified; `docs/ACCEPTANCE_DEV_SERVER.md`
   still documents the retired Coolify deploy path; the hosted-template reseed defect
   (aidream FOUND_DEFECTS ~L1117) is still open though the dev template's flock'd sync is the fix
   pattern. Missing capability = LOUD "unavailable because X", never silent absence.
6. **Codex path to LIVE mirroring.** In order: release the quarantine fix (plugin still
   `alpha-3`/"Unreleased" on main — bump + tag), Arman runs `/hooks` trust once per machine,
   build the trust detector + honest `/work/connections` status (chip fired earlier, never
   executed), then verify real codex sessions land. Managed-Codex runtime remains design-only
   (`docs/MANAGED_RUNTIME_PLAN.md`).
7. **Web sync door (TASK-007) is now feasible** — `SyncStatePanel`'s "browser cannot reach the
   desktop" rationale predates the Broadcast bridge RPC; add `coding_history.*` handlers beside
   `coding_runtime.*` and give AI Work real preview/import/status/retry/discard. TASK-008
   (reconnect/account UX) still not started. Live-path multi-account identity still unproven.
8. **Conformance + docs debt (single sweep):** BEHAVIOR.md 12-MUST conformance was chipped but
   never executed (MUST #1 mismatch statement likely missing); `features/ai-work/FEATURE.md`
   drift (inspector→detail mount, schedule-prefill claim, SyncStatePanel mechanism copy);
   matrx-local AGENT_TASKS hygiene (TASK-003/003b done-but-Active); 2 pre-existing failing tests
   in `compose-destinations.test.ts`; 19 `Auto:%` titles remain among coding-bound conversations
   (was 1 — regressed during the backfill wave; re-run title sync after the outbox drains, then
   investigate any survivors).
9. **Distribution (all Arman-gated):** VS Code — 40 min in `matrx-vscode/OPERATOR_CHECKLIST.md`;
   Cursor — public repo or team plan; Claude plugin public marketplace publication.
10. **Analysis surfaces polish:** row-level analyze actions on the inbox (today it's two clicks via
    detail), durable analysis outputs (note/association), thread-level War Room placement, FTS
    when ILIKE stops scaling.

## Done (one line each; details live in the named code/FEATURE.md)

- Contract, two `chat` tables, owner-only RLS, four-provider event mirror, idempotency/leases —
  contract FEATURE.md; unique binding constraint live in DB (2026-08-19 verified).
- Claude plugin `alpha-6` (OAuth hooks, transcript locator, health that proves attachment).
- Titles both directions + workspace/branch labels + placeholder backfills — matrx-local
  `title_sync.py`/`claude_label_writer.py`, aidream `titles.py`.
- Claude history import + 160-session backfill + capture reconciler + capture UI + capture-gap
  alert — matrx-local, `ClaudeHistorySync.tsx`, `CaptureGapAlert`.
- LOCAL Claude runtime end-to-end (start/resume/cancel over Broadcast bridge, native ledger,
  folder approvals, desktop card, composer destination, Continue panel) — production-proven,
  146 sessions.
- Hosted managed runtime production-CERTIFIED (backend) incl. broker gzip fix.
- `conversations` MCP+platform tool, five analysis agents mounted on both detail views.
- AI Work Hub: inbox (honest last-activity sort, compact star, real titles), transcript with tool
  calls + load-earlier, organization, search, composer + Saved Requests, connections with account
  grouping — v0.4.845.
- Outbox poison-row quarantine (both sides: matrx-local v1.4.35 + codex plugin main) — release
  pending install/tag (item 1/6).
- Codex/Cursor certified transports; VS Code packaged `v0.1.1`; ownership consolidation; OAuth
  identity repair; the EC2/Coolify production-origin incident fixes.

## Decisions needed (each self-contained)

- ~~Hosted lane (item 5)~~ **RULED 2026-08-20 (Arman): BUILD IT — "really no question that we want
  the hosted lanes as well… that was never a question."** The new dev sandbox is the proving
  ground: prove the cloud environment can run managed sessions there, then wire the hosted
  destination into the product. Not everything needs a cloud lane, but the path is to build this
  out completely — **any missing capability must be a VERY LOUD missing thing** (explicit
  "not available because X" in the UI and docs), never silently absent.
- **Quarantined events (item 1):** after the v1.4.35 update, 88 quarantined envelopes represent
  events that will never reach the platform unless individually repaired. Repair or accept loss?
