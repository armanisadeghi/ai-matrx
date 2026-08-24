---
status: active
updated: 2026-08-24
repos: [matrx-frontend, aidream, matrx-local, matrx-claude-plugin, matrx-codex-plugin, matrx-cursor-plugin, matrx-vscode, matrx-sandbox, common-docs]
vision:
  - /Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md
  - /Users/armanisadeghi/code/common-docs/projects/coding-agent-bridge/PLAN.md
  - /Users/armanisadeghi/code/common-docs/systems/coding/coding-session-bridge/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/systems/coding/coding-session-bridge/BEHAVIOR.md
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

## The global map — every component and its state (re-verified 2026-08-24)

| Component | State | Proof |
|---|---|---|
| Contract + raw ledger + projection (aidream `services/coding_session_bridge/`) | LIVE; projector reclassified (sidecar kinds + empty Stops skip; native tool_use/tool_result pair into `chat.tool_call` in BOTH lanes) | 977k entries; **projection errors: 0** after set-based backfill (148,968 historical tool_calls minted) |
| Claude event mirror (matrx-claude-plugin `alpha-6`) + history import + reconciler | LIVE | newest entries minutes old |
| Titles Claude→Matrx + return direction | LIVE; 193+78 drifted titles backfilled with ladder precedence (0 user renames touched) | cloud titles == Claude sidebar |
| **Pins + categories Claude→Matrx** | **LIVE end-to-end**: app localStorage LevelDB → `~/.claude/claude-code-pins-extract.py` → ledger (`sync-claude-code-sessions.py`, wipe-guarded) → matrx-local `claude_session_index.py` → SessionMetadata (flip-detection; explicit-category contract) → `conversation.is_favorite` + bridge category → AI Work Category column | 1,223 sessions carry pin state via the live pipe; pins restored INTO Claude via `~/.claude/claude-code-pins-writeback.mjs` (Arman ran it, app adopted) |
| Desktop engine auth / outbox | **RESOLVED 2026-08-24**: root cause was the retired Supabase project's publishable key baked into every build (CI secret never rotated at East cutover); fixed bbdc48b01 + secret rotation, shipped v1.4.43; Arman re-logged-in | outbox 42,192 → ~59; engine v1.4.47 ok |
| `conversations` tool search+provider | FIXED on main (nested-Subquery ORM fix) + forcing-function regression tests added; feedback `2f29a244` resolved `awaiting_review` | 5+13 tests green |
| AI Work UI | LIVE incl. watchable running sessions (v0.4.851), Category column + facet, schedule prefill (with Suspense boundary) | — |
| Local Claude runtime | LIVE, heavily used | 146+ native sessions |
| Hosted (sandbox) Claude runtime | Backend certified (pre-migration — treat unre-certified); UI-orphaned | item 3 |
| Codex event mirror | quarantine fix RELEASED `v0.2.0-alpha.4`; hooks still untrusted on real hosts = mirrors nothing | item 4 |
| Cursor / VS Code | certified/packaged; distribution Arman-gated | item 7 |

## Resources

- **Behavior bar (read FIRST):** `common-docs/systems/coding/coding-session-bridge/BEHAVIOR.md`.
  Contract: `.../FEATURE.md` (invariant added 2026-08-24: tool use/result pair into ONE
  `chat.tool_call` in both lanes). Product plan: `common-docs/projects/ai-work-hub/PLAN.md`.
- **Backend:** aidream `aidream/services/coding_session_bridge/` (service, orm_store, backfill.py +
  `scripts/backfill_native_tool_projections.py` — per-row, resumable; historical bulk was applied
  set-based 2026-08-24). **Frontend:** `features/ai-work/`. **Local:** matrx-local
  `app/services/coding_sessions/` (ledger reader `claude_session_index.py`).
- **Machine (Arman's Mac):** `~/.claude/sync-claude-code-sessions.py` (launchd, ledger keeper) ·
  `claude-code-pins-extract.py` (LevelDB read, venv `~/.claude/.sync-venv`) ·
  `claude-code-pins-writeback.mjs` (app-closed pin restore; categories are server-synced per
  account — local cross-account replication is impossible, verified: the app restores scopes from
  Anthropic's servers on launch).
- **DB probes:** asyncpg + aidream `.env` `SUPABASE_MATRIX_*`; outbox
  `sqlite3 ~/.matrx/matrx.db "select count(*) from coding_session_bridge_outbox"`.

## Remaining work (priority order)

1. **Verify the last mile after the aidream deploy** (deploy agent ships main): new sidecar-kind
   entries stop erroring; run one sweep of the sidecar receipt UPDATE for any stragglers (pattern
   in this doc's history / `backfill.py`); confirm `Auto:%` titles decay as title sync runs.
2. **Favorite return direction (design gap, accepted for now):** pin mirror is one-way with
   flip-detection — an AI Matrx favorite change survives unchanged provider observations but a
   real Claude-side flip wins; favoriting in AI Matrx never reaches Claude. The return path =
   ledger write + `claude-code-pins-writeback.mjs` mechanics. Also open: auto-run write-back when
   Claude is closed and drifted (needs Arman's yes — standing automation).
3. **Hosted lane — RULED BUILD (2026-08-20).** Blocker: `development` sandbox is EC2-tier-only
   while managed Claude is hosted-tier-only by an isolation gate (contract FEATURE.md:232) —
   review bwrap/socat isolation on the dev image, open EC2 tier deliberately, re-certify the
   hosted endpoints (their 08-15 certification predates the AWS migration), then wire
   `/claude/stream`+`/cancel` into `/work/new`. Missing capability = LOUD "unavailable because X".
4. **Codex to LIVE mirroring:** Arman runs `/hooks` trust once per machine (plugin alpha-4 is
   released); build the trust detector + honest `/work/connections` status; verify real codex
   sessions land. Non-claude native tool outcomes are skipped-not-guessed by design — revisit
   per-provider rules when codex native entries actually flow.
5. **Web sync door (TASK-007):** add `coding_history.*` handlers beside `coding_runtime.*` over
   the Broadcast bridge; give AI Work real preview/import/status/retry/discard. TASK-008
   (reconnect/account UX) not started. Live-path multi-account identity unproven.
6. **Conformance + docs debt:** BEHAVIOR.md 12-MUST pass never executed (MUST #1 mismatch
   statement likely missing); matrx-local AGENT_TASKS hygiene (TASK-003/003b done-but-Active);
   owner-eyes browser pass on live watchable sessions (owner-only by construction).
7. **Distribution (all Arman-gated):** VS Code publish checklist (40 min); Cursor repo
   visibility; Claude plugin marketplace.
8. **Analysis surfaces polish:** row-level analyze on the inbox, durable analysis outputs,
   thread-level War Room placement, FTS when ILIKE stops scaling.

## Done (one line each; details in code/FEATURE.md)

- Contract, raw tables, RLS, event mirror, idempotency/leases; unique binding live.
- Titles both directions; pins/categories capture + platform mirror + backfills (95→ favorites,
  categories, 271 title corrections); AI Work Category column; watchable runs; schedule prefill.
- Projection ledger CLEAN: sidecar/empty-Stop reclassification, native tool pairing both lanes,
  148,968 historical tool_calls, projection errors 0 (2026-08-24).
- East-key auth incident: root-caused, fixed, released (v1.4.43), outbox drained 42k→~59.
- Outbox durability (v1.4.36–38), poison-row quarantine both sides (codex plugin alpha-4
  released); 88 quarantined codex rows preserved-by-design (repair-or-accept still open below).
- Adversarial-review hardening 2026-08-24: pin flip-detection (no favorite clobber), explicit
  category observation contract, StopFailure named receipts, per-provider sidecar gate,
  duplicate-tool_use_id ordinal ids, create_tool_call race convergence, ledger wipe-guard on
  total emptiness, write-back keeps pins the ledger has no real opinion on.
- macOS TCC Documents watcher finding handed to Arman (System Settings toggle).

## Decisions needed

- **Quarantined codex events:** 88 envelopes (entry_mutated, preserved) — repair upstream ids or
  accept loss?
- **Standing automation:** auto-run the pin write-back when Claude is closed and drifted (item 2)?
