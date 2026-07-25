# Agents Browse — the canonical feature-entry list

**Status:** live at `/agents/browse`, iteration 1. Proving ground for the list shell every feature will adopt.
**Owner surface:** `app/(core)/agents/browse/page.tsx` → `features/agents/browse/`

`/agents/all` is untouched and still the production gallery. This is a **new route beside it**, deliberately, so the shape can be iterated on without breaking a page 372 agents live in. When the shape settles, this becomes the reusable shell and `/agents/all` is retired into it.

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

### 1. Style persists, query does not

`useListViewPrefs("agents-browse")` (`lib/list-views/`) stores **view, density, sort, direction, page size, hidden columns** in the synced `userPreferences.listViews` module.

Search text, column filters, page number, and the active scope tab are **deliberately not stored**. Restoring a stale search that renders an empty list is a bug wearing a feature's clothes.

> **Known wart:** preferences hydrate after first paint, so a cards-preferring user sees the table for a beat before it flips. Same class as the old transcripts "first paint is always grid". Fixing it properly means an SSR-readable preference, not a `localStorage` shortcut.

### 2. One menu, every action

`agentActionRegistry.tsx` builds ONE `ItemMenuConfig` consumed identically by the table row menu, the card kebab, the compact-row kebab, and right-click. `/agents/all` had **three** divergent hard-coded lists — cards had 10 icons, rows had 9 (with a different icon for the same action), and the modal that both opened had 7. This makes that drift structurally impossible.

Actions the surface exposes outside the menu (the card's star, the row's inline rename) call `toggleFavorite` / `renameTo` from `useAgentRowActions` — the same code the menu entries call, never a parallel path.

The table shows exactly ONE affordance per row. `MatrxDataTable`'s own row-copy icons and side-panel icon are switched off (`copy.showRow: false`, `detail.enabled: false`) because the menu already carries Copy link, Copy for AI, and Quick look — three more ways to do the same thing is the dilution this page exists to end.

### 3. Scopes, and the data they were hiding

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
| `types.ts` | `AgentBrowseRow` (derived from the generated RPC return — never hand-mirrored), `BrowseScope`, `BrowseQuery`, `BrowseScopeCounts` |
| `service.ts` | The two RPC calls. Browser → Supabase direct; no Next hop, no Python hop |
| `useAgentBrowse.ts` | Query state + fetch. Generation-guarded so a slow response for an abandoned query can't overwrite a newer one |
| `useAgentRowActions.tsx` | Binds the registry to behaviour; owns the modals as page-level singletons (not one `ShareModal` per row, which is what `/agents/all` mounts) |
| `agentActionRegistry.tsx` | THE action list |
| `components/AgentBrowsePage.tsx` | Assembly |
| `components/AgentBrowseTable.tsx` | Default view — `MatrxDataTable` in **controlled** mode |
| `components/AgentBrowseCards.tsx` / `AgentBrowseRows.tsx` | Card + dense views |
| `components/BrowseScopeTabs.tsx` | The four scopes + org dropdown |
| `components/BrowseToolbar.tsx` | Search, filters, view switcher, density |
| `components/AddToSetDialog.tsx` | Dialog shell over the existing `useAgentSetsList` + `addAgentToSet` (the existing `AddToSetMenu` renders its own trigger, so it can't be reached from a menu entry) |

## Invariants

- **The table is CONTROLLED.** Sort and pagination are server operations over the whole result set. A column whose filter cannot be served by `agx_list_scoped` is declared `filter: false` rather than rendering a control that quietly filters only the current page — that is the exact defect in the `/transcripts` table.
- **Every `ORDER BY` ends in `id`.** A non-total order silently drops rows across pages; that bug already cost this table 59 of 365 agents once (`agx_get_list_stable_pagination.sql`).
- **Scope tabs show server totals**, never `rows.length`.
- **Coming Soon entries are registered**, never bare strings — see `lib/coming-soon/`.
- Static top chrome clears the glass header with `pt-[calc(var(--shell-header-h)+…)]`; only the list body scrolls behind it.

## Open iteration items

- Column visibility picker (`hiddenColumns` is plumbed through and persisted; no UI yet).
- Only `category` filters server-side. Extending `agx_list_scoped` with more filter params is the way to light up more column filters honestly.
- Pre-hydration view flash (above).
- Mobile toolbar wraps to three rows; wants a bottom-sheet collapse.
- Multi-select + bulk actions — `MatrxDataTable` has single-row selection only.
- Generalising this into the reusable shell, then retiring `/agents/all` into it.

## Change log

- **2026-07-25** — Built. `agx_list_scoped` + `agx_list_scope_counts` applied and verified live; `lib/list-views/` and `lib/coming-soon/` primitives extracted; `ItemMenu` dropdown taught to scroll (a 20+ entry menu had its tail off-screen and unreachable); `ConfirmDialog` taught `cancelLabel: null`.
