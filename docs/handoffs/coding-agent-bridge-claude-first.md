---
status: active
updated: 2026-09-08
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

## The global map — every component and its state (RE-VERIFIED LIVE 2026-09-08)

Nothing below is carried forward on trust — every row was re-checked against the live engine
(v1.4.74 installed / v1.4.75 released), the live DB, the machine ledger, and git history today.

| Component | State (2026-09-08) | Proof |
|---|---|---|
| Capture: Claude hooks → cloud | LIVE | newest `chat.coding_session_entry` seconds old |
| **Outbox delivery (importer/codex lanes)** | **BLOCKED since 08-30 — 118,492 rows, growing.** Server (correctly, per the no-assigned-org law) refuses org-scoped deliveries: "You belong to more than one organization and haven't set a default." Arman's `users.user_preferences → organization.defaultOrganizationId` is NULL (verified). Engine-side half fixed in `9c3026d61` (owner-scoped routes no longer demand an org; 116,803 wrongly-deferred rows auto-requeued) — the remaining unlock is Arman picking a default org in desktop Settings. Nothing lost: rows are durable locally. | outbox sqlite + fresh 17:28 error + prefs query |
| Projection ledger | CLEAN (8 errors total; was 449k on 08-24) | live count |
| Titles / pins / categories pipeline | LIVE end-to-end; ledger fresh today (1,456 entries, 227 pinned, 39 categorized); **pin mirror rewritten `378aa5f9f`**: favorites now upsert `platform.user_entity_state` (the star UI's real path — the old `chat.conversation.is_favorite` column is frozen; 171 favorites live). Labels UNMASKED to full email per Arman's 2026-09-07 ruling (`c5c9558e3` local + aidream). Sidebar ledger now wins over auto titles in the index reader. | ledger mtime 09:21 today; DB counts |
| Local runtime trigger (browser → Mac) | **Transport PROVEN 2026-08-26** over the real Broadcast channel (launch → execute → status → cancel), and **22 `origin=matrx_local` sessions created since** — the lane is in use. Identity-probe fallback (Claude ≥2.1.228 `auth status` misreports signed-out; desktop OAuth record fallback, key byte-stable) shipped v1.4.55. **Still missing: one clean browser-UI end-to-end proof WITH mirror, run by/with Arman** — never demonstrated to him. | proof script `scratchpad` (gone) → re-derive from `features/ai-work/lib/matrxLocalRuntime.ts`; runtime_runs + DB |
| Desktop auth self-heal | SHIPPED v1.4.54 (engine never wipes stored session on a bad posted one; UI refresh-then-signout loudly) | token valid to 09-15; no 401 storms |
| AI Work UI | Reorganized into three buckets (AI chats / External app runs / Internal Matrx runs) via `public.cvx_audience` (`7257690791`); live updates through the realtime manager (`650325ea7`); canonical favorites read (`415c592922`); add-to-projects action; Category column | git + live UI |
| Desktop `/claude-code` screen | REBUILT 08-30 (`f835747a4`): one list, one sync button, real per-session cloud status from the server (`9c3026d61`), every count clickable into evidence | git |
| Codex / Cursor / VS Code | UNCHANGED since 08-24: codex plugin `alpha-4` released but hooks untrusted on real hosts (mirrors nothing); Cursor/VS Code distribution Arman-gated | git (no commits) |
| Hosted (sandbox) lane | UNCHANGED: ruled BUILD 08-20, blocked on EC2-tier isolation review; endpoints unre-certified since AWS migration | git (no commits) |

## Resources

- **Vision/contract (read FIRST):** `common-docs/systems/coding/coding-session-bridge/BEHAVIOR.md`
  + `FEATURE.md`; product plan `common-docs/projects/ai-work-hub/PLAN.md`.
- **Backend:** aidream `aidream/services/coding_session_bridge/` (favorites now via
  `platform.user_entity_state` — `378aa5f9f`). **Frontend:** `features/ai-work/` (browser→Mac
  relay `features/ai-work/lib/matrxLocalRuntime.ts` — v2 rpc envelopes on Broadcast channel
  `matrx-local-bridge:<userId>`; engine handlers `matrx-local/app/api/coding_runtime_handlers.py`).
- **Local:** matrx-local `app/services/coding_sessions/` (probe fallback in `claude_probe.py`;
  org resolution `app/services/aidream/organization.py` — default org =
  `users.user_preferences → organization.defaultOrganizationId`, picker in desktop Settings).
- **Machine (Arman's Mac):** `~/.claude/sync-claude-code-sessions.py` (launchd ledger keeper,
  alive) · `claude-code-pins-extract.py` (LevelDB read) · `claude-code-pins-writeback.mjs`
  (app-closed pin restore; categories are Anthropic-server-synced per account — local
  cross-account replication impossible, verified 08-22).
- **Probes:** outbox `sqlite3 ~/.matrx/matrx.db "select count(*) from coding_session_bridge_outbox"`;
  engine `curl -s http://127.0.0.1:22140/health`; engine session (loopback)
  `GET /auth/token`; DB via aidream `.env` `SUPABASE_MATRIX_*`.

## Remaining work (priority order)

1. **Unblock the 118K-row outbox (ARMAN, ~30 seconds): set a default organization in the AI
   Matrx desktop app → Settings → organization.** His preference is verifiably NULL and the
   server (correctly) refuses org-scoped deliveries without it. Then WATCH the drain (probe
   above), expect residual failure classes to surface (MXL-D-079 large-envelope TLS is still
   latent beneath), and verify 08-30→09-08 sessions appear in `/work/conversations`.
2. **Finish the trigger proof FOR Arman (his #1 ask, 2026-08-26: "prove that it works, then
   make it better").** Transport is proven and 22 runtime sessions exist, but he has never
   seen the clean loop himself: /work/new → "Claude Code on my Mac" → watch it stream →
   conversation with mirror. Deliver as a guided session with the URL. Then the "make it
   better" pass: launch latency, honest availability copy, resume affordances.
3. **Favorite return direction:** AI Matrx star → Claude pin (ledger write + the write-back
   mechanics exist); plus the standing automation (auto-restore pins when Claude is closed and
   drifted) — needs Arman's yes.
4. **Hosted lane** (ruled BUILD): EC2-tier isolation review on the dev sandbox image →
   re-certify hosted endpoints → wire `/claude/stream`+`/cancel` into `/work/new`. LOUD
   unavailability copy until then.
5. **Codex to LIVE:** Arman runs `/hooks` trust once per machine; trust detector + honest
   `/work/connections` status; verify real codex sessions land.
6. **Docs debt:** BEHAVIOR.md 12-MUST conformance pass (never executed; baseline v1.4.33 is
   now ancient vs v1.4.75 — several MUSTs likely drifted, e.g. masked labels are now
   deliberately UNMASKED by Arman's 09-07 ruling → BEHAVIOR.md needs that ruling folded in);
   matrx-local AGENT_TASKS hygiene; common-docs FEATURE.md favorites-path update
   (`user_entity_state`).
7. **Distribution (Arman-gated):** VS Code checklist, Cursor repo visibility, Claude plugin
   marketplace.

## Done (compressed; details in code/FEATURE.md)

- 08-21→24: titles/pins/categories unification + backfills; projection ledger 449k errors → 0
  with 148,968 historical tool_calls; East-key auth incident root-caused/shipped; adversarial
  hardening (flip-detection, explicit category observation, etc.).
- 08-26: browser→Mac trigger transport proven live; auth self-heal (v1.4.54); identity-probe
  fallback (v1.4.55).
- 08-27→09-07 (other sessions): favorites → `user_entity_state` (`378aa5f9f`); unmasked labels
  ruling executed; three-bucket conversation list + realtime manager; `/claude-code` screen
  rebuild with server-truth sync status; engine org fix + 116,803-row requeue (`9c3026d61`);
  anonymous-list access revoked.

## Decisions needed

- Default organization: item 1 is an Arman action, not a decision — but if he wants the bridge
  exempt from org scoping instead, that's a ruling against the no-assigned-org law (not
  recommended).
- Standing automation: auto-run pin write-back when Claude is closed and drifted (item 3)?
- Quarantined codex events (88, entry_mutated, preserved): repair upstream ids or accept loss?
