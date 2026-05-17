# Tool Registry · UI Surfaces (v2)

**Status**: shipped
**Owner**: tool-registry
**Routes**: `/admin/surfaces`

## What this is

The dedicated admin UI for the `ui_surface` table. Built to scale to the
~100+ surfaces this system has (vs. the typical 1–2 most apps need), with
grouping, bulk operations, usage stats, and inline editing.

The simpler per-row CRUD on `/admin/lookups` (UI Surfaces tab) still exists
and is fine for one-off edits, but a callout banner there directs admins to
the v2 page for serious management.

## Why a dedicated page

The original `UiSurfaceCrud` (under `/admin/lookups`) is a flat table. With
~100 surfaces across 4 clients, that becomes unusable:

- No grouping → an admin can't tell which surfaces are "pages" vs "overlays"
  vs "debug" without reading every row.
- No bulk ops → activating an entire tier of debug overlays would take 10
  individual clicks.
- No usage info → an admin can't tell which surfaces actually have tools or
  agents pointing at them, so dead surfaces accumulate silently.
- No inline edit → changing a description means opening a modal per row.

The v2 page solves all four.

## Architecture

- **Service**: [features/surfaces/services/surfaces.service.ts](./services/surfaces.service.ts)
  - `listSurfacesWithStats()` — single round-trip that fans out 3 reads
    (`ui_surface` + `tl_def_surface` + `agx_agent_surface`) and joins counts
    in JS. Cheaper than three separate sequential queries; cheaper than a
    server-side RPC for a table that admins read at most a few times per session.
  - `bulkSetSurfacesActive(names, active)` — one `UPDATE ... WHERE name IN (...)`.
  - `tierFor(sortOrder)` + `SURFACE_TIERS` — convention-driven grouping (see
    "Sort_order tiers" below).
- **Component**: [features/surfaces/components/SurfacesAdminPage.tsx](./components/SurfacesAdminPage.tsx)
  - Client tabs (matrx-admin / matrx-user / matrx-public / chrome-extension /
    All) drive the primary filter.
  - Status filter (active / inactive / all) and free-text search refine.
  - Body groups by tier (Pages, Specialized, Overlays, Editor variants, Debug).
  - Per-row controls: select checkbox, inline description edit (click to
    expand), tool-count badge, agent-count badge, active toggle, delete with
    FK-cascade-aware confirm.
  - Bulk control bar appears when ≥1 row is selected: activate / deactivate /
    clear selection.
  - "New surface" dialog with client picker, local-name input (validates
    `^[a-z0-9-/]+$` so multi-segment names like `debug/state-analyzer` are
    allowed), tier picker (auto-assigns sort_order = tier.min + 50), and
    description.

## Sort_order tiers (convention)

There's no `kind` or `category` column on `ui_surface`. Tiering is done via
`sort_order` ranges, and the UI groups + labels each band:

| Sort range | Tier label      | What goes here |
|---|---|---|
| 0–99       | Reserved        | (intentionally empty — reserved for future / pinned items) |
| 100–299    | Pages           | Top-level routes / primary destinations |
| 300–999    | Specialized     | Power-user surfaces, secondary tools |
| 1000–1999  | Overlays        | Modals, sheets, popout windows |
| 2000–8999  | Editor variants | Editor and authoring surfaces |
| 9000+      | Debug           | Admin-only debugging overlays |

The "New surface" dialog uses the tier picker to assign `sort_order = tier.min + 50`,
so new surfaces land in the middle of their band and don't collide with seeded rows.

## Seed (current production state)

After migration `seed_matrx_frontend_surfaces_expanded` (2026-05-05):

| Client | Active | Total |
|---|---|---|
| `matrx-user` | 46 | 59 |
| `matrx-admin` | 18 | 33 |
| `matrx-public` | 5 | 8 |
| `chrome-extension` | 2 | 2 |
| **Total** | **71** | **102** |

The inactive 31 are placeholders for emerging surfaces (beta UIs, debug
overlays not yet wired, etc.) — they're seeded so tools/agents can opt-in
to gating against them without admin work, but not activated by default.

## Conventions baked in

- `confirm()` from `@/components/dialogs/confirm/ConfirmDialogHost` for
  destructive actions.
- No barrel files; direct imports.
- No `useMemo` / `useCallback` / `React.memo` (per CLAUDE.md, React Compiler
  handles memoization).
- Bulk delete is intentionally NOT supported — single-row delete with
  cascade-warn is enough; bulk delete is a footgun for FK-target tables.
- Hard delete is allowed (no `is_active=false` "soft delete" alternative
  needed since `is_active` already exists). The confirm message warns when
  the surface has tool or agent references.

## v2.1 — full enrichment (2026-05-05 second pass)

After the user-requested "go all in" pass, the page picks up:

- **Per-surface detail drawer** ([SurfaceDetailDrawer.tsx](./components/SurfaceDetailDrawer.tsx)) opens on row name click or chevron. Shows:
  - Identity edit (active toggle, description edit, **rename**)
  - "Tools on this surface" — joined `tl_def_surface ⋈ tl_def`, click-through to the tool admin
  - "Agents visible here" — joined `agx_agent_surface ⋈ agx_agent`
  - "Custom tool UI components" — `tl_ui` rows scoped to this surface
- **Rename support** with FK cascade. Backend migration `ui_surface_fk_cascade_on_update` adds `ON UPDATE CASCADE` to the three FKs (`tl_def_surface.surface_name`, `agx_agent_surface.surface_name`, `tl_ui.surface_name`), so renames are a single atomic UPDATE that auto-propagates to all dependent rows.
- **Bulk delete** in the bulk action bar. The confirm aggregates tool/agent reference counts across all selected rows and warns explicitly that DELETE is non-cascading (FK behavior on delete is `NO ACTION`).
- **"Add from candidates" dialog** ([SurfaceCandidatesDialog.tsx](./components/SurfaceCandidatesDialog.tsx)) — a curated catalog ([data/surface-candidates.ts](./data/surface-candidates.ts)) of ~70 plausible-but-unseeded surfaces (window-panel overlays, second-tier admin pages, agent embedding widgets, etc.) discovered via codebase inventory. Filter by client / kind / search, multi-select, optionally force-active on insert, bulk insert in a single round-trip.
- **"New client" dialog** inline (NewClientDialog at the bottom of the page file). Avoids round-tripping to `/admin/lookups` to add a `ui_client`.
- **Keyboard shortcuts**: `/` focuses the search input; `Esc` closes the open drawer / dialog / clears selection (in that priority order).
- The candidate-count badge on the "Candidates" button shows how many catalog rows aren't yet seeded — naturally trends to 0 over time.

## Change Log

- **2026-05-05** — v2 page shipped at `/admin/surfaces`. Backend seed
  expanded to 102 surfaces. Banner added to `/admin/lookups` UI Surfaces
  tab pointing at v2.
- **2026-05-05 (later)** — v2.1: drawer, rename via FK cascade, bulk
  delete, candidate inventory dialog, inline client creation, keyboard
  shortcuts.
- **2026-05-15** — `matrx-user/notes` manifest expanded from the Phase 1
  stub (4 surface-specific values) to a full 19 surface-specific + 5
  baseline declaration covering selection / scope mirror, active-note
  metadata, workspace context (open tabs, folder tree), and editor / pane
  state. Renamed `current_note_category` → `current_note_folder`
  (existing name was misleading; zero downstream bindings to migrate).
  Notes editor context menu now emits the surface scope and tags
  `runtime.surfaceName = "matrx-user/notes"` so `agx_agent_surface`
  bindings resolve at launch. See `features/notes/hooks/useNotesSurfaceScope.ts`.
