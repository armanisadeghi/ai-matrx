---
name: supabase-realtime
description: The canonical doctrine for ALL Supabase realtime in matrx-frontend — postgres_changes, broadcast, and presence. Use BEFORE writing or modifying any `.channel(` subscription, any handler that reacts to a table this client also writes (echo suppression), any autosave/optimistic-update loop that coexists with realtime, reconnect/backoff logic, live-collaboration UX (who-is-editing indicators), or when replacing a polling loop with realtime. Triggers on "realtime", "postgres_changes", "broadcast", "presence", "echo", "subscription", "channel", "the tab freezes", "duplicate messages", "live sync", "collaborative editing". This bug class froze whole browsers ~10 times in 6 months — this skill is the reason it stopped.
---

# Supabase Realtime — the Matrx doctrine

Realtime + Redux + autosave is the most freeze-prone combination in this app. Every historical browser lockup traced to one of the mechanisms below. Reference implementations: **`features/notes/redux/realtimeMiddleware.ts`** (postgres_changes, the canonical one), `features/files/redux/realtime-middleware.ts` (request-ledger id-dedup variant), `features/data-tables/collab/SupabaseYjsProvider.ts` (broadcast CRDT).

## Rule 1 — Suppress your own echoes, timestamp-monotonic FIRST

**Supabase sends you your OWN writes.** The realtime echo of your UPDATE arrives **50–500ms AFTER** your REST response has already returned the fresh row — so by the time the echo lands, any "in-flight save" flag is already cleared. **Flag-only suppression always misses the echo.**

The canonical guard (`isOwnEcho` in the notes middleware + the same check in its slice merge):

1. **Strictly older `updated_at` than local state → drop.** An echo that isn't newer carries zero information.
2. **Equal `updated_at` → drop only if content fields also match local** (a same-millisecond collaborator write must still land).
3. **While a save is in flight** (`_savingNoteIds`-style flag), additionally content-match: divergent collaborator payloads must still reach the store (that's a real conflict).
4. Parse timestamps with `Date.parse` on both sides; if either is unparseable, fall through to content-match — degrade to delivering, never to silently dropping.

Apply the same monotonic guard **inside the reducer merge** too (`applyServerNoteUpsert`): list fetches and realtime race, and a stale payload merged into state regresses `updated_at`, which then fails the next save's optimistic lock → sticky false conflict.

Alternative for INSERT-heavy streams (DM messages): **id + client_message_id dedup** (optimistic row carries a client id; the echo confirms it). Still add the monotonic rule for UPDATE payloads, and **early-drop `sender_id === userId` before any per-event network call** — own echoes must never cost an RPC or a refetch.

**What an unsuppressed echo does** (the notes freeze, 2026-07): echo of save N arrives while the user typed toward N+1 → dirty-local ≠ server → false `conflict` → conflict UI does O(n²) diff work per render → next save clears it → its echo re-arms it. Self-sustaining main-thread saturation.

## Rule 2 — One batched dispatch per payload; no heavy work per event

- List/history hydration: **ONE dispatch for the whole page** (`upsertNotesFromServer` pattern). A dispatch-per-row loop notifies every subscriber and re-runs every sorted selector once PER ROW — O(N²·log N), a freeze on large datasets.
- Never run an N+1 RPC waterfall per event (one `get_*_user_info` per participant per message). Cache identity lookups in a module map; batch where possible.
- Never compute O(content) work (diffs, LCS, full-corpus filters, O(all-rows) projections) inline in JSX or per event — memoize keyed on the actual input.
- Event-driven refetches (`focus`, `visibilitychange`, per-INSERT list reloads) get a **min-interval gate or debounce**. An unthrottled "reload everything on any event" handler is a storm waiting for busy traffic.

## Rule 3 — Reconnect: backoff + catch-up, and the counter survives flaps

- On `CHANNEL_ERROR` / `TIMED_OUT`: exponential backoff (1s → 30s cap), resubscribe, then **catch-up fetch** (events during the gap are lost forever — realtime has no replay).
- **Do NOT reset the attempt counter on `SUBSCRIBED`.** Reset it only after the channel stays healthy ~30s (`BACKOFF_RESET_AFTER_MS` in the notes middleware). A flapping channel otherwise cycles at the 1s floor forever, each cycle firing a full catch-up fetch.
- The catch-up fetch's own completion must not re-trigger subscription (guard: only (re)subscribe when the channel is missing or the user changed).

## Rule 4 — Lifecycle: middleware-owned, one channel per feature, unique topics

- **Prefer a Redux middleware** as the subscription owner (start on first data load, stop on state reset). Component effects resubscribe on identity churn and multiply channels across mounts — the `useConversations` bug ran one global subscription (each doing a full N+1 reload per event) per mounted picker/panel.
- **One channel per feature.** postgres_changes + broadcast + presence can share a channel — don't run three.
- **Always wrap topics in `uniqueChannelTopic()`** (`utils/supabase/realtime.ts`). Static topics collide with the still-joined channel on React 19 double-invoked effects / Fast Refresh and throw "cannot add postgres_changes callbacks after subscribe()".
- Callbacks and mutable values the handler needs: hold in refs / read from `storeApi.getState()` at event time — never in effect deps.

## Rule 5 — Server-side prerequisites (silent-zero-events checklist)

A subscription that compiles but receives nothing has one of these:
1. Table not in the `supabase_realtime` **publication** (the notes 2026-07-10 data-loss bug).
2. Middleware written but never **registered in `lib/redux/store.ts`** (same bug, part 2).
3. **RLS** filters the events (realtime is RLS-authorized — that's a feature; use it instead of client-side owner filters, but it means grants gate delivery).
4. `REPLICA IDENTITY FULL` missing when you need old-row data or RLS-on-DELETE.
5. New table not yet in PostgREST/realtime schema cache (`notify pgrst, 'reload schema'`).

## Rule 6 — Choosing the transport

- **postgres_changes** — durable rows where RLS must gate delivery (notes, files, tasks). The default for entity sync.
- **broadcast** — ephemeral or high-frequency data with no authorization nuance (CRDT updates, typing). Set `self: false` unless the sender genuinely needs its own event. **Never manually broadcast a row you also INSERT** — every subscriber gets it twice.
- **presence** — who's-here rosters (typing, online, multiplayer). Ephemeral only.
- Attribution without presence: if the table has **`updated_by`** (the `_stamp_actor` trigger stamps it platform-wide), every UPDATE payload already identifies its editor — resolve email via `get_user_emails_by_ids` (cached), as the notes "X is editing" bubble does. Reach for a presence channel only when you need is-connected state, not just who-last-wrote.

## Live-collaboration UX (the notes pattern — reuse, don't reinvent)

`features/notes/` ships the reference "who is editing" UX:
- Middleware: `announceEditor()` — on non-self UPDATE, dispatch `setNoteEditor` (userId + cached email), idle-clear timer (8s), late email resolution never resurrects/extends a stale entry.
- State: `noteEditors: Record<entityId, NoteEditorPresence>` + curried `selectNoteEditor(id)`.
- UI: `NotePresenceBanner` (name + animated `notes-editing-dots`), `RecentChangeOverlay` `editorLabel` bubble anchored to the exact changed text, `editorDisplayName()` (email local-part, "Someone" fallback).

## Verification checklist (every realtime change)

- [ ] Two browser sessions (two users): edits in A appear in B; **typing in A while B saves never flags a conflict in A**.
- [ ] Console: no per-keystroke `[RT]` upsert/suppression spam while typing (own echoes silent).
- [ ] Own writes cost zero extra RPCs/refetches (network tab during a send/save burst).
- [ ] Kill the network for 30s, restore: catch-up fetch fires once, missed rows appear, no reconnect loop at 1s.
- [ ] Table verified in the `supabase_realtime` publication + middleware registered in the store.

## Current per-feature state (2026-07-15)

| Feature | Transport | Echo strategy | Status |
|---|---|---|---|
| Notes (`features/notes/redux/realtimeMiddleware.ts`) | postgres_changes `workbench.notes` | timestamp-monotonic + content-aware + save-flag | **Canonical reference** |
| Files (`features/files/redux/realtime-middleware.ts`) | postgres_changes ×5 tables | request-ledger id-dedup | Good — second reference |
| Transcript studio (`features/transcript-studio/redux/realtimeMiddleware.ts`) | postgres_changes | event-split routing | Good |
| DM (`hooks/useSupabaseMessaging.ts`, `features/messaging/MessagingInitializer.tsx`, `lib/supabase/messaging.ts`) | pg_changes + manual broadcast + 2 presence channels | id+client_message_id dedup; self-RPC skip + monotonic UPDATE guard + own-send refetch skip + debounced list reload (2026-07-15) | Improved; **open backlog:** no catch-up on reconnect; `useConversations` still subscribes per mount (5 consumers that mostly only need `createConversation`); manual broadcast doubles delivery; N+1 `get_dm_user_info` waterfalls; 3 channels per open conversation |
| Data tables (`SupabaseYjsProvider`) | broadcast CRDT (`self:false`) | Yjs idempotence | Good |
| **Suspicious set — apply this skill before touching:** `features/tasks/hooks/useTaskManager.ts` (static topics + refetch-on-any-change, no suppression), `features/file-analysis/hooks/useAnnotations.ts` (writes + listens, no suppression, static topic), `features/code/hooks/useTabRealtimeWatcher.ts` (conflict detection without self-write flag), `features/agents/ui-first-tools/redux/agent-lists.thunks.ts`, `features/public-chat/components/sidebar/SidebarChats.tsx` (static topic), `features/transcripts/context/TranscriptsContext.tsx`, `features/memory/components/MemoryManager.tsx` | | | |

Polling loops that should become realtime (candidates, verified 2026-07-15): `features/ai-runs/hooks/useAiTasks.ts`, `features/code/redux/codeEditHistoryThunks.ts` (its own Phase-2 comment says so), `features/cms/hooks/useCmsAdminActivity.ts`, `features/pdf/scanner/useScanSaveFlow.ts`, admin events/scanner-health/sandbox status pages.

Full history + invariants: `features/notes/FEATURE.md` § Freeze-loop doctrine. CLAUDE.md carries the one-line pointer under Core invariants → Realtime.
