# Window Panels — persistence (local-first workspace cache + URL)

Companion to the `window-panels` skill. Read when the task involves saving or restoring window state, `onCollectData`, ephemeral / autosave windows, or `?panels=` URL deep-linking.

## Persistence (local-first workspace cache + URL)

> **The `window_sessions` Supabase table is GONE** (dropped 2026-08-12, public-schema triage — it had 0 rows and no code consumer). Persistence is a local-first, tab-scoped workspace cache: IndexedDB + localStorage via `features/window-panels/persistence/localWindowSessionStore.ts`, account-isolated, default-deny per audited registry entry (see FEATURE.md 2026-07-20 entry). Nothing window-related is stored server-side.

**Save triggers — only two.** Nothing else writes to the store (moving, resizing, sidebar toggle, tab switch do NOT save):
1. **Explicit** — user clicks "Save window state" in the green dropdown.
2. **Piggyback** — child code calls `onCollectData` as part of its own save.

**`onCollectData`** returns a plain JSON-serializable object — wrap it in `useCallback` with all deps (it's called synchronously at save time). `WindowPanel` merges it under the chrome state (`windowState`, `rect`, `sidebarOpen`, `zIndex`) and writes to the local workspace store (IndexedDB, per-account).

- **On close** — `WindowPanel` deletes the row, so it doesn't reopen next load.
- **On page load** — `WindowPersistenceManager` reads the local workspace, clamps each rect into the current viewport (`utils/rectClamp.ts`, 48 px min visible strip), and dispatches `openOverlay` + `restoreWindowState` **before** `WindowPanel` mounts.
- **Ephemeral windows** (`ephemeral: true` in the metadata entry) skip persistence — the "Save window state" button is hidden, close skips the delete. Use for debug panels, one-shot tool dialogs, and callback-group windows whose caller-side state can't survive reload.
- **Autosave-on-blur** (`autosave: true` / implied by `heavySnapshot: true` in metadata) saves on tab-hide + unmount with a 500 ms debounce; `onHeavySnapshot` awaits an async buffer serializer before the write.

**URL deep-linking (`?panels=…`).** A window with `urlSync.key` in its metadata auto-activates `useUrlSync` — no prop wiring needed (explicit `urlSyncKey` / `urlSyncId` props still override). Instance id falls back to `overlayId` for singletons, reading like `?panels=notes:notesWindow`. Every metadata `urlSync.key` needs a hydrator in `url-sync/initUrlHydration.ts` (dev assertion logs missing ones).
