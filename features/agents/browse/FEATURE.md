# Agents Browse — the canonical feature-entry list

**Status:** THE agents list, live at `/agents/all` (round 3). Proving ground for the list shell every feature will adopt.
**Owner surface:** `app/(core)/agents/all/page.tsx` → `features/agents/browse/`
**Cutover:** the previous gallery moved to `/agents/classic`, reachable only from the dismissible `ClassicViewNotice`. `/agents/browse` redirects here. **Delete the notice, its `display.agentsClassicNoticeDismissed` preference, and `/agents/classic` together (~mid-Aug 2026).**

The folder is still named `browse/` (its implementation namespace); the ROUTE is `/agents/all`.

---

## Why it exists

Two good list pages existed, each strong where the other was weak:

| | `/agents/all` | `/transcripts` |
|---|---|---|
| Cards | Clean shape, 10 unlabeled icon actions | Messy shape, few **named** actions |
| Table | None | Bespoke, no sticky header, non-canonical |
| Scope | Mine / Shared / All | none |
| Persistence | none | view mode only, localStorage |
| Paging | fetch-all → slice in browser | per-section "show more" |

This page takes the best half of each and fixes what **neither** did:

1. **View style is remembered** — per user, synced across devices.
2. **The table is the default**, and one `…` menu per row carries *every* record-level action.
3. **Mine / My Orgs / Shared / Public** — real scopes with true server counts. "My Orgs" is new, and it was hiding real data (see below).

---

## The three fixes, concretely

### 0. Full server-side filtering + sorting

**APP POLICY: every column sorts AND filters. No exceptions.** Both are served
by `agx_list_scoped`, so they apply to the whole result set — never to the 25
rows on screen. Where a column has a finite value set the filter offers real
OPTIONS with counts from `agx_list_facets`; date columns (Updated, Created)
filter by relative bucket (`agx_since_bucket`), because a date column's finite
value set is "how recently", not "which exact timestamp".

**Sorting is on the DATABASE column, never the rendered cell.** That is why the
favorite star lives in its own leading column rather than inside Name — a star
glyph in the Name cell would disturb alphabetical ordering, and Favorite
deserves to be sortable and filterable in its own right.

The column headers and the Filters panel write the SAME `p_filters` bag keyed
by column id, so setting "Analysis & Research" from the Category header and
from the panel are literally the same query. One filter model, two entry points.

### 0b. Filtering mechanics

Every narrowing control maps to an `agx_list_scoped` parameter, so a filter
applies to all 2,000 rows — never to the 25 on screen. Filters & Sort lives in
the popover shape `/agents/all` established, rebuilt on the now-shared
primitives in `components/official/filter-panel/parts.tsx`.

**Facets are computed server-side** (`agx_list_facets`). This is not a nicety:
one account has **34 categories and 773 distinct tags**. Deriving "which
categories exist" from loaded rows means loading every row, which is the exact
pattern this page replaced. Options come back WITH counts, ordered by count,
capped with a "show N more", and searchable across the full set.

**Favorites first, then most recently changed, is the default sort** — pinned
above every other ordering via `p_favorites_first`, toggleable in the panel.
What you starred is what you reach for; burying it under 400 rows sorted A–Z is
how a favorites feature stops being used.

**The filter badge counts only filters the user applied.** `/agents/all`'s badge
read "1" on an untouched page because it counted the sort and the active tab —
a permanent lie that trains people to ignore the number.

Facets deliberately ignore the category/tag selection itself: a facet list that
drops the option you just deselected traps the user inside their own filter.

### 1. Row interaction

- **The whole row opens `AgentActionModal`** — the classic Run / Edit / View
  chooser from `/agents/classic`. Pointer cursor. Name and description are
  plain text (not links) so their clicks open the modal too. Interactive cells
  (favorite star, the kebab, an open inline editor) stop propagation.
- **Name and Description edit only via the hover pencil.** Clicking the text
  never enters edit mode and never navigates. Category (dropdown) and Tags
  (chips) still edit on click. Edits stay local until the floating Save pill
  commits them, then persist via one UPDATE per row. `"tags"` and
  `editTrigger: "pencil"` live on the canonical `MatrxDataTable` — extended,
  not forked. Description previews use `cleanMarkdownPreview`; headings are
  flattened, image destinations omitted, and whitespace collapsed before the
  width-capped table or card renders them.
- The kebab (⋮) still carries the FULL `ItemMenu` (every registry action).
  Modal and menu share the same handlers from `useAgentRowActions`.

### 2. Style persists, query does not

`useListViewPrefs("agents-browse")` (`lib/list-views/`) stores **view, density, sort, direction, page size, hidden columns** in the synced `userPreferences.listViews` module.

Search text, column filters, page number, and the active scope tab are **deliberately not stored**. Restoring a stale search that renders an empty list is a bug wearing a feature's clothes.

`version` on the stored blob is a real backfill: when `BROWSE_COLUMNS` gains or
loses a column the surface bumps `SURFACE_DEFAULTS.version`, and older stored
prefs are re-seeded from the defaults (view/density/sort survive; column
selection resets). Without it, every user with ANY stored blob keeps
`hiddenColumns: []` forever, so each newly added column arrives switched ON.

> **Known wart:** preferences hydrate after first paint, so a cards-preferring user sees the table for a beat before it flips. Same class as the old transcripts "first paint is always grid". Fixing it properly means an SSR-readable preference, not a `localStorage` shortcut.

### 3. One menu, every action — and it reads like Chrome's

`agentActionRegistry.tsx` builds ONE `ItemMenuConfig` consumed identically by
the table row menu, card kebab, compact-row kebab, and right-click.
`/agents/all` had **three** divergent hard-coded lists.

Menu style rules, set against Chrome's app menu as the benchmark:

- **No header.** The row the menu belongs to is two inches away and already
  says the name; a title + description block is pure wasted height.
- **No explanatory second lines.** A menu is a list of verbs. "Edit details"
  does not need "Name, description, category, tags" — the user finds out by
  clicking. Every second line halves how many actions fit on screen.
- **Qualifiers are trailing badges, not lines.** "Coming soon" is a `SOON` chip
  at the end of the row (`ItemMenuEntry.badge`), costing zero height.
- **Length is not a problem; a hidden tail is.** The menu is ~23 entries and
  that is fine. It is bounded by Radix's own available height and, when it
  overflows, the bottom edge FADES (`useScrollFade`) so the eye knows to
  scroll. A hard clip reads as "finished" and the user never scrolls — that bug
  put Delete off-screen and unreachable.

Actions the surface exposes outside the menu (the card's star, the row's inline rename) call `toggleFavorite` / `renameTo` from `useAgentRowActions` — the same code the menu entries call, never a parallel path.

The table shows exactly ONE affordance per row. `MatrxDataTable`'s own row-copy icons and side-panel icon are switched off (`copy.showRow: false`, `detail.enabled: false`) because the menu already carries Copy link, Copy for AI, and Quick look — three more ways to do the same thing is the dilution this page exists to end.

### 4. Scopes, and the data they were hiding

`agx_list_scoped` (migration `migrations/agx_list_scoped.sql`) is a real server-side scoped reader with a real `total_count`.

**Every user agent is `visibility='internal'` with an `organization_id` — yet `agx_get_list` only ever returned rows you own or were explicitly granted.** Agents your own teammates created in your own org were invisible platform-wide. On the first live run of this page, "My Orgs" immediately surfaced an agent (`Badass Titanium Baby Agent`, Titanium org) that `/agents/all` cannot show at all.

| Scope | Question it answers | Predicate |
|---|---|---|
| `mine` | What did I make? | `user_id = auth.uid()` |
| `orgs` | What does my team have? | created by someone else, in a **non-personal** org I belong to, `visibility IN ('internal','public')` |
| `shared` | What did someone hand me? | explicit `iam.permissions` grant (user or org) |
| `public` | What has the platform published? | `visibility = 'public'`, not mine |

`orgs` and `shared` may overlap for the same row. That is correct and intentional — they answer different questions, and hiding an org row because it also carries a grant would make "what does my team have?" lie.

**UI shape:** one fixed `My Orgs` tab (blended across all your orgs) with a dropdown to narrow to one. Not one chip per org — a user belongs to a personal org + N companies and N grows, so a chip-per-org tab bar has unbounded width and offers no blended view. `components/official/ListScopeSwitcher.tsx` still uses the chip shape; if this proves better it should absorb it rather than the two diverging.

Org/Owner/Access columns appear only when scope ≠ `mine` — inside "Mine" every row has the same owner, so they'd be pure noise.

---

## Files

| File | Role |
|---|---|
**The generic shell lives in `lib/entity-list/`** (extracted 2026-08-08 —
read its `FEATURE.md`): the query hook, scope tabs, toolbar, filter panel,
column picker, table, and page assembly are shared with `/transcripts` and
future list surfaces. What remains here is the AGENT half:

| File | Role |
|---|---|
| `types.ts` | `AgentBrowseRow` (derived from the generated RPC return — never hand-mirrored), declared scopes, re-exports of the generic vocabulary |
| `service.ts` | The RPC calls + inline-edit save. Browser → Supabase direct; no Next hop, no Python hop |
| `listConfig.tsx` | THE config handed to `<EntityListPage>` — service, columns, scopes, row-actions hook + modals, card/row renderers, copy config |
| `useAgentRowActions.tsx` | Binds the registry to behaviour; owns the modals as page-level singletons (not one `ShareModal` per row) |
| `agentActionRegistry.tsx` | THE action list |
| `columns.tsx` | EVERY column the row can show, with `defaultHidden` / `locked` / `scopedToShared` flags (spec type + cell helpers from `lib/entity-list/columns`) |
| `components/AgentBrowsePage.tsx` | Thin: `<EntityListPage config>` + this page's slots (notice, Sets/New buttons) |
| `components/AgentBrowseCards.tsx` | Card view (render prop in the config) |
| `components/AgentBrowseRows.tsx` | Dense view — full-width rows, aligned zones |
| `components/ClassicViewNotice.tsx` | TEMPORARY cutover banner → `/agents/classic` |
| `components/AddToSetDialog.tsx` | Dialog shell over the existing `useAgentSetsList` + `addAgentToSet` |

## Invariants

- **The table is CONTROLLED.** Sort and pagination are server operations over the whole result set. A column whose filter cannot be served by `agx_list_scoped` is declared `filter: false` rather than rendering a control that quietly filters only the current page — that is the exact defect in the `/transcripts` table.
- **Every `ORDER BY` ends in `id`.** A non-total order silently drops rows across pages; that bug already cost this table 59 of 365 agents once (`agx_get_list_stable_pagination.sql`).
- **Scope tabs show server totals**, never `rows.length`.
- **Project linkage is association-backed.** `agx_list_scoped` never returns or reads a physical `agent.definition.project_id`; optional agent/project context lives in `platform.associations`.
- **Coming Soon entries are registered**, never bare strings — see `lib/coming-soon/`.
- Static top chrome clears the glass header with `pt-[calc(var(--shell-header-h)+…)]`; only the list body scrolls behind it.

## The table is deliberately un-opinionated

`columns.tsx` declares every column; the surface ships a sensible default set
and the user turns on any of the rest (Created, Version, Visibility, Favorite,
Agent ID today). Adding a column is a row in that file, never a redesign.

Only the four keys `agx_list_scoped` can `ORDER BY` are clickable-to-sort. A
header that sorts one page and calls it "sorted by Name" is worse than a header
that does not sort at all — that is the live defect in `/transcripts`' table.

Default page size is **25**, and pagination is a real server `LIMIT/OFFSET`. A
list surface that ships a 100-row default page is fine at 30 records and
hostile at 2,000.

## Open iteration items

- Pre-hydration view flash (above).
- Multi-select + bulk actions — `MatrxDataTable` has single-row selection only.
- Column ORDER and width are not user-controlled yet (visibility is).

## Change log

- **2026-08-09 (doors)** — THE DOOR LAW moved into the shell: the config now
  declares `door: { token: "agent" }` and `lib/entity-list` anchors the Name
  cell to `/agents/[id]` (see `lib/entity-list/FEATURE.md`) — no per-column
  wiring. Two relationships the RPC already returned stopped being text: the
  Organization cell is an `EntityRef` (open / new tab / peek), and rows with a
  `source_agent_id` gain an "Open source agent" door in the ONE action menu.
  `task_id` is deliberately NOT rendered — the column is 100% NULL and carries
  no FK, so any link would be a guess.

- **2026-08-08 (extraction)** — Steps 2–5 of the canonical entity-list
  extraction: the generic halves (query hook, scope tabs, toolbar, filter
  panel, column picker, table, page shell) moved to `lib/entity-list/`; this
  surface is now `listConfig.tsx` + `<EntityListPage>`. Behaviour unchanged;
  the menu's Rename entry (previously latent — no dialog rendered) now opens a
  TextInputDialog.
- **2026-08-08** — Added the semantic Agents H1, named the favorite-column
  sort control, raised mobile scope targets to 44px, and sanitized Markdown
  description previews across table and card views.
- **2026-07-29** — Mobile browse chrome is one scope/actions row plus one
  search/actions row: scope labels collapse accessibly to icons, Sets/New use
  icon tap targets, and view/density/reset move into one Display menu. The
  shared `GenericTablePagination` now remains one concise row on phones instead
  of stacking page size, range, and controls into three rows.
- **2026-07-28** — Restored classic row-click → `AgentActionModal` (table,
  dense rows, cards). Name is plain text again (not a Run/Build link) so
  clicking it opens the chooser. Name/Description edit is pencil-only.
  Description column width-capped. Kebab keeps the full `ItemMenu`.
- **2026-07-28 (D112)** — Rows are no longer mouse-only. `MatrxDataTable`
  columns gained `href`: the title cell renders a real `next/link` (keyboard
  focus, SR link semantics, cmd/middle-click new tab) while the whole-row
  click stays a mouse convenience (row `onClick` ignores clicks on anchors).
  On a linked EDITABLE cell (Name), inline edit moves from click-text-to-edit
  to a hover/focus pencil beside the link. Dense view's name is a real link
  too; cards already were.

- **2026-07-28** — Removed the stale `project_id` return/read from
  `agx_list_scoped` and the obsolete agent→project FK-containment registry edge.
  This restores list, scope-count, facet, and drift-alert reads after
  `agent.definition.project_id` was retired; agent/project links remain on
  canonical associations.
- **2026-07-26 (round 3)** — Promoted to `/agents/all`; old gallery moved to
  `/agents/classic` behind a dismissible notice. `agx_list_scoped` v3: one
  jsonb filter bag, every column sortable + filterable, date buckets, facets
  for every finite column. Full-row click, inline edit (name / description /
  category / tags) with a new `tags` cell-edit type on the canonical table,
  vertical kebab, favorite promoted to its own column. Compact list rebuilt.
- **2026-07-26 (round 2)** — Full server-side filtering + sorting restored and
  extended: `agx_list_scoped` v2 (categories, tags, tri-state favorites,
  favorites-first) + `agx_list_facets`. Filter/sort popover rebuilt on shared
  primitives. Column registry + picker. Page size 25. Menu cleaned to Chrome
  standards (no header, no second lines, `SOON` badges). `useScrollFade`
  primitive + fade on menu and filter panel. Prefs shape `version` + backfill.
- **2026-07-25** — Built. `agx_list_scoped` + `agx_list_scope_counts` applied and verified live; `lib/list-views/` and `lib/coming-soon/` primitives extracted; `ItemMenu` dropdown taught to scroll (a 20+ entry menu had its tail off-screen and unreachable); `ConfirmDialog` taught `cancelLabel: null`.
