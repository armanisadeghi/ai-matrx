# Arman Tasks — Matrx Frontend

_Last updated: 2026-07-12_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active (ranked — quickest wins first)

### 1. Approve/reject the 3 defect→task promotions (seconds)
Open `FOUND_DEFECTS.md` → `## Pending Arman review` (prepared 2026-07-12): D34.2 capability fields, D45 mobile flashcard rendering, D31(d) `check:definer-grants` CI guard. Say yes/no per item in chat; the next agent moves approved ones to AGENT_TASKS.

### 2. Decide: server-side hardening for `is_visible_to_user` (seconds — a decision)
TASK-001 (agent handoff integration) hides plumbing message rows with an FE read filter only. Deliberately not enforced via RLS/view on the backend because that would also hide the rows from admin/debug surfaces. Decide: FE-filter-only (status quo) vs. RLS/view hardening on `chat.message`. Context: `aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md`.

### 3. Decide: D35 `platform.association_types` PK shape (seconds — a decision)
The 2-col PK `(source_type, target_type)` forbids the designed label+generic rule coexistence. Recommended: option (2) — surrogate `id uuid` PK + keep the 3-col unique index (needs aidream ORM regen, cross-repo commit). Alternatives in the D35 entry. Say "option 1/2/3" and an agent executes.

### 4. Decide: aidream B4 Gemini TTS regression (blocks D40 end-to-end)
aidream feedback `e89a15cb` (critical): the in-flight B4 param-shaping work makes `GenerateContentConfig` reject `tts_voice`/`audio_format`, breaking ALL Gemini TTS. The stall fix (`83a94245d`) is already on origin/main. Decide the B4 fix approach before B4 ships; then any agent re-runs `/podcast/generate` and confirms a `study_media` audio row reaches `status='ready'`.

### 5. Authorize the Supabase MCP for Claude Code (one-time, ~30s)
The Supabase MCP now requires OAuth and non-interactive sessions can't complete it — DB verification steps silently degrade without it. In an interactive Claude Code session in this repo, run `/mcp` and complete the Supabase auth flow.

## Pending Arman review

_(none — current asks are all in Active)_

## Future

_(none)_

## Done

_(none yet)_
