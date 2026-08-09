# List view preferences — "remember how I like to look at this list"

One hook, `useListViewPrefs(surfaceKey, surfaceDefaults?)`, backed by the synced `userPreferences.listViews` module.

## What it replaces

Five hand-rolled `localStorage` blocks, each with its own key and its own locally-declared view-mode union, none of which followed the user to another device. **All five are gone** — `/transcripts` 2026-08-08 (deleted with the hub rewrite onto `lib/entity-list`), the remaining four on 2026-08-09:

| Surface | `surfaceKey` | Retired key |
|---|---|---|
| `features/projects/components/ProjectsHub.tsx` | `projects-hub` | `projects-view` |
| `features/tasks/components/TaskListPane.tsx` | `tasks-list-pane` | `tasks-list-view` |
| `app/(core)/documents/page.tsx` | `documents-hub` | `documents-hub-view` |
| `components/image/cloud/CloudImagesTab.tsx` | `image-manager-cloud` | `image-manager:cloud-images-view` |

**No hand-rolled list-style copy is left. A new one is a defect** — a `localStorage` key holding a view mode, density, sort, page size, or column selection is this hook's job.

Two survivors are deliberately NOT list style and stay where they are: `features/marketing/components/pages/WorkspaceViewToggle.tsx` (Current / Plan / Studio) and `features/user-lists/components/LayoutToggle.tsx` (split / tree). Both choose **which panes are on screen**, not how one list's rows are presented — a different axis with no `view`/`density` meaning.

## Mapping a surface whose toggle isn't `table` / `cards` / `rows`

`view` is a closed union on purpose. A surface with different labels maps onto the two persisted axes rather than widening it or casting:

- A grouped/dense list ("List") is **`rows`** — `TaskListPane` is `rows` vs `table`.
- A cozy-vs-compact grid is one `view` (`cards`) at two **densities** — `CloudImagesTab`'s three buttons are `cards`+`comfortable`, `cards`+`compact`, and `rows`. The toggle id is a render-time projection of the pair, never a third persisted vocabulary.

A surface that renders only two of the three views narrows on read (`prefs.view === "table" ? "table" : "cards"`) — never a cast. If a surface genuinely cannot be expressed on these axes, say so and leave it; a lying cast puts a value in synced storage that no other surface can read.

## The split that matters

**STYLE is persisted. QUERY is not.**

| Persisted (style) | Never persisted (query) |
|---|---|
| shape `version` | search text |
| view (`table` / `cards` / `rows`) | column filters |
| favorites-first | scope tab |
| density | |
| sort + direction | page number |
| page size | |
| hidden columns | |

Restoring a stale search or filter means a user returns to a list that looks empty for no visible reason. That is a bug, not a convenience. Scope is a *destination*, not a style — it starts at `mine` every time.

## Defaults

`LIST_VIEW_DEFAULTS` in `defaults.ts`. **Table-first is deliberate**: the table is the only view that can show every column, sort every column, and reach every per-record action from one menu. Cards are a browsing affordance layered on top, not the baseline.

A surface passes `surfaceDefaults` for what IT wants absent a stored preference; the user's stored value always wins over both.

## Shape versioning is the backfill

`ListViewPrefs.version` is the surface's declared shape version. A stored blob
from an older version is re-seeded from the defaults — view / density / sort /
favorites-first survive, column selection resets.

**Bump the surface's `version` in the same change that adds or removes a
column.** Without it, every user with ANY stored blob keeps their old
`hiddenColumns` forever, so each newly added column arrives switched ON for
them and OFF for new users. That is a shape change shipped without a backfill,
which this codebase has been bitten by before.

## Rules

- **One `surfaceKey` per list page.** Never reuse a key across two lists — their column ids would collide in `hiddenColumns`.
- Writes go through `useListViewPrefs`, never `setPreference` directly, so the resolved whole is always written and a partial stored blob can't lose a field a surface later reads.
- Persistence is the **synced** tier (Redux → IDB + localStorage mirror → Supabase `user_preferences`, debounced 250ms). Consequence: preferences hydrate *after* first paint, so a non-default view flashes the default briefly. Fixing that needs an SSR-readable preference, not a `localStorage` shortcut.

## Change log

- **2026-08-09** — Migrated the last four hand-rolled `localStorage` blocks
  (ProjectsHub, TaskListPane, `/documents`, CloudImagesTab) onto the hook;
  documented the two-axis mapping for non-canonical toggles.
- **2026-07-26** — Added `version` + the re-seed backfill; `favoritesFirst`
  joins the persisted set; default page size dropped 50 → 25.
- **2026-07-25** — Created with the `listViews` preferences module; first consumer `/agents/browse`.
