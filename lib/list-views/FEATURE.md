# List view preferences — "remember how I like to look at this list"

One hook, `useListViewPrefs(surfaceKey, surfaceDefaults?)`, backed by the synced `userPreferences.listViews` module.

## What it replaces

Four byte-identical `localStorage` blocks, each with its own key and its own locally-declared `HubViewMode` union, none of which followed the user to another device:

- `features/projects/components/ProjectsHub.tsx` (`"projects-view"`)
- `features/transcripts/components/TranscriptsListPage.tsx` (`HUB_VIEW_STORAGE_KEY`)
- `features/tasks/components/TaskListPane.tsx` (`LIST_VIEW_STORAGE_KEY`)
- `app/(core)/documents/page.tsx` (`HUB_VIEW_STORAGE_KEY`)

Those four are **not yet migrated** — `/agents/browse` is the first consumer. Migrating them is the follow-up, and each migration deletes a `useState` + `useEffect` + a local type.

## The split that matters

**STYLE is persisted. QUERY is not.**

| Persisted (style) | Never persisted (query) |
|---|---|
| view (`table` / `cards` / `rows`) | search text |
| density | column filters |
| sort + direction | page number |
| page size | active scope tab |
| hidden columns | |

Restoring a stale search or filter means a user returns to a list that looks empty for no visible reason. That is a bug, not a convenience. Scope is a *destination*, not a style — it starts at `mine` every time.

## Defaults

`LIST_VIEW_DEFAULTS` in `defaults.ts`. **Table-first is deliberate**: the table is the only view that can show every column, sort every column, and reach every per-record action from one menu. Cards are a browsing affordance layered on top, not the baseline.

A surface passes `surfaceDefaults` for what IT wants absent a stored preference; the user's stored value always wins over both.

## Rules

- **One `surfaceKey` per list page.** Never reuse a key across two lists — their column ids would collide in `hiddenColumns`.
- Writes go through `useListViewPrefs`, never `setPreference` directly, so the resolved whole is always written and a partial stored blob can't lose a field a surface later reads.
- Persistence is the **synced** tier (Redux → IDB + localStorage mirror → Supabase `user_preferences`, debounced 250ms). Consequence: preferences hydrate *after* first paint, so a non-default view flashes the default briefly. Fixing that needs an SSR-readable preference, not a `localStorage` shortcut.

## Change log

- **2026-07-25** — Created with the `listViews` preferences module; first consumer `/agents/browse`.
