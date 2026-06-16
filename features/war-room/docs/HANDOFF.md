# War Room — Handoff (2026-06-16)

Takeover doc for the autonomous build kicked off after the "system structure
review". The canonical feature doc is [`../FEATURE.md`](../FEATURE.md); this is
the live working state + what's left.

## Mission (user's words, distilled)

1. **A** — fix the false "recording" status on threads.
2. **B** — restore the transcription embed to FULL functionality: **never strip**.
   Compact is fine, but every feature must be a few clicks away **and still work**,
   revealed **in place** (not navigate-away). Drive the **core** component with
   props — never fork/duplicate it. (The rule for EVERY War Room embed.)
3. **C** — build the missing **tier-2** agent (per-War-Room, sees all its threads),
   completing the 3-tier hierarchy.
4. **"and some more"** + a creative-thinker pass (expansions for enterprises /
   research firms / individuals) + parallel adversarial passes (bugs / weaknesses),
   then loop until the vision is attained.

## DONE + committed + live-verified

| | What | Commit | Verified |
|---|---|---|---|
| **A** | Recording status reads the LIVE `recordingsSlice` signal, not session existence. `useTilePulse` + `PulseGlyph` now show "Recording"/equalizer ONLY when the global recording target session is one of the tile's sessions AND isRecording/isTranscribing (stable-primitive selector → no 60fps re-render). A session that merely exists → static "Audio"/"Transcript"/"N recordings" + static `AudioLines` glyph. | `1503b4e2e` | LIVE: room threads read "Notes"/"0/1 done"/"Empty"/**"Audio"** — no false "Recording". |
| **B** | `CleanupPad` (the SHARED component) embedded variant got a **reveal bar**: "Controls" opens the REAL `sidebarBody` (clean agent · context items · dictionary · clean-up) as an in-place drawer; "Custom" stacks the custom-agent slots. `sections` prop seeds the collapsed initial state. Page-scoped session list + the GLOBAL `ActiveContextButton` gated behind `{!isEmbedded}` (tile owns sessions; invariant #1). `TileAudioTab`: tile's own session list always visible. **Page variant byte-for-byte unchanged.** | `fa1180595` | LIVE: Controls drawer shows Cleaning Agent + Context (+"Load from notes…") + Dictionary + Clean Up; "Working Context" correctly absent. |
| **C** | Tier-2 room agent: `service/roomAgentContext.ts` (`buildRoomAgentContext` = master roster filtered to ONE room), `hooks/useRoomAgent.ts` (durable per-room conversation, master tools minus create_room), `components/room/RoomAgentPanel.tsx`, wired into `WarRoomShell` (a "Room Agent" header button → inline WindowPanel + `MasterWatchLayer` mounted in-room). Reuses master tools/dispatcher/resolver/`warRoomWatch` — no DB/server change. | `f9cc373ad` | LIVE: "Room Agent" button present in the room header; typecheck-clean. |

Typecheck: **zero** errors in war-room / transcription-cleanup / recordings / roomAgent. (The only repo TS errors are in `features/research/*` — concurrent work, NOT ours.)

## IN-FLIGHT — 4 review agents running (background) when this was written

Launched on A+B+C. Read their results, then act on findings + LOOP.
- **Adversarial / correctness + regressions** — agent `abc97a676d7b15a89`.
- **Adversarial / never-strip + architecture** — agent `a4f61ac12a07ddda3`.
- **Adversarial / invariants + data + context** (has Supabase MCP) — agent `abc957044749d8960`.
- **Creative thinker / expansions** — agent `adbbd3c1a283b81e8`.

(Use SendMessage to continue any of them; or just read the completion notifications.) After integrating findings, re-typecheck + re-verify + commit, then loop again until confident.

## OPEN / NEXT

- **[D] Auto-map other tabs → transcription context sections** (the user's stated "next big step", collaborative — confirm approach before building). The seam already exists: the embedded Controls → Context panel has a **"Load from notes…"** affordance + "Add context block". Extend so a thread's task/notes/files/working-doc auto-populate the session's `contextItems` (CleanupContextPanel, `handleContextChange` in `CleanupPad`), so the clean/custom agents see the whole thread. Task #24.
- **[#15] Lift cleanup edit-state to Redux** — no DB; touches the transcription core; needs a live `/transcripts/cleanup` regression (drive the mic check WITH the user). Task #15.
- **Naming** — the "cool name" for the room / for "threads" is a deliberate later step (DB tokens are internal + rename-safe; don't rename routes/tables mid-stream).
- **Test artifacts to clean** (cosmetic): 2 duplicate "Live Pipeline Demo" rooms (`ebd9c530…`, `b6547eb5…` — the latter is the older dup) + the test thread with ~35 audio sessions in room `424678a2-df55-4ee2-af9a-b8b6c4e2ea2b`. A direct prod DB delete was (correctly) blocked by the auto-mode classifier; delete via the `/all` card delete, or via the now-available Supabase MCP `execute_sql` with the user's ok.

## Key facts a takeover agent needs

- **DB model:** room↔thread is **one-to-many** (`ctx_war_room_tiles.session_id → ctx_war_room_sessions ON DELETE CASCADE`, no junction). A **tile = a thread's room-scoped presence** (linkage + layout); the SUBSTANCE is in substrate tables (`ctx_tasks`/`notes`/`studio_sessions`/`cld_files`/`udt_documents`), and those links are **non-exclusive** (a session/task/note/file can link to many tiles) → a thread's substance can live in 2 rooms without M2M; "import a thread" = new tile sharing-or-copying substrate. Soft-deleting a room never destroys substance. Audio↔room is **indirect** (studio_session → tile → room).
- **3-tier agents:** Tier1 per-thread (`TileAgentPanel`/`useStudioAssistant`, conversation = `studio_sessions.assistant_conversation_id`, `war-room-tools`). Tier2 per-room (`useRoomAgent`/`roomAgentContext`, room roster, master-tools-minus-create_room). Tier3 master (`useMasterAgent`/`masterAgentContext`, all rooms, full `war-room-master-tools`). Dispatcher/resolver are room-agnostic; the ROSTER is what scopes tier-1/2.
- **The never-strip pattern (B is the template):** embed the REAL component; pass a `sections`/variant prop to collapse; add an in-place reveal (drawer/toggle) for the hidden parts; gate out only what's genuinely page-scoped or invariant-violating (e.g. the global `ActiveContextButton`). NEVER a minimalist fork.
- **Verify war-room data env-independently:** the dev UI is flaky after a cache-clear restart; the reliable path is the Supabase MCP `execute_sql` (now authed) OR `aidream/.venv/bin/python` + `db.apply_migrations._build_dsn()` + psycopg. Dev-login: `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/war-room/...` (token in `.env.local`).
- **Migrations:** apply via Supabase MCP `apply_migration` (now available) OR the aidream applier (`db/apply_migrations.py --source matrx-frontend --only <name> --no-generate`), then `pnpm db-types`; `pnpm check:migrations` green.

## Be me

Warm, high-trust collaboration. BUILD IT REAL — reuse the real component, verify
live (or at the data layer when the UI is flaky), commit each piece, never fake a
verification, update the memory + this doc as you go. The user steps away and
trusts the loop to keep its eye on the vision.
