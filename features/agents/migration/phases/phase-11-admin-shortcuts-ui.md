# Phase 11 — Admin Shortcut Management UI

**Status:** complete
**Owner:** _unassigned_
**Prerequisites:** Phase 1
**Unblocks:** Phase 16 (deprecate admin prompt-builtins routes)

## Goal

Mount the shared CRUD components from `features/agent-shortcuts/` at `app/(authenticated)/(admin-auth)/administration/agent-shortcuts/`. Admin manages global-scope shortcuts, categories, and content blocks.

## Routes
- `.../administration/agent-shortcuts/` — dashboard
- `.../administration/agent-shortcuts/shortcuts/` — table
- `.../administration/agent-shortcuts/categories/` — tree
- `.../administration/agent-shortcuts/content-blocks/` — table
- `.../administration/agent-shortcuts/edit/[id]/` — detail editor

## Success criteria
- [x] Every component is reused from `features/agent-shortcuts/components/` — no duplicates.
- [x] Scope prop hardcoded to `'global'` at this route.
- [x] Link from the legacy `administration/prompt-builtins` page pointing to the new one during dual-run.

## Notes for Phases 12 / 13

While mounting the shared CRUD surface for admin, the following observations will apply equally to user and org scopes:

- **`ShortcutForm` requires `categories` as a prop.** The form isn't hook-driven for categories, so every mount point must surface the current scope's categories (via `useAgentShortcuts({ scope, scopeId })`) and forward them. User and org pages should do the same.
- **`CategoryTree` requires `categories` as a prop.** Same pattern — read from the hook, pass in. Not a bug, just a contract.
- **Category delete flow is not built into `CategoryTree`.** The component exposes `onDelete?` but no confirmation dialog; the mounting page owns the AlertDialog. Admin page already does this; user/org pages must replicate.
- **Category toggle-active is mount-owned.** `CategoryTree` exposes `onToggleActive?` but the mutation lives in the page via `useAgentShortcutCrud`. Same as above.
- **The edit-by-id page opens the form as a modal rather than rendering inline form fields.** The shared `ShortcutForm` is a Dialog/Drawer component, not a bare form, so an edit-route page is necessarily a "shell + modal" rather than an inline editor. If a future phase wants inline-editing, a new shared `<ShortcutFormBody />` export would be needed. Not blocking for Phase 11.
- **`ShortcutForm.variableDefinitions` is not currently wired.** For deep variable-mapping UX (to render variable picker dropdowns in `ScopeMappingEditor`) the form needs the selected agent's variable definitions. Admin page currently passes no defs; falling back to free-text mapping is acceptable in this phase. Phase 12/13 may want to load these via a separate agent-variables hook.

No bugs discovered in the shared components during this phase.

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-07-18 | codex | Reconciled the `Agents: System` admin catalog with `/administration/system-agents`: the category card now opens the umbrella hub, the hub links all 11 catalog entries (including All Shortcuts and all three create flows), and the all-routes directory keeps the complete system-agent route family together. |
| 2026-04-21 | claude | Created `app/(authenticated)/(admin-auth)/administration/agent-shortcuts/layout.tsx` + `AgentShortcutsLayoutClient.tsx` (tabbed admin nav, mirrors prompt-builtins pattern). |
| 2026-04-21 | claude | Created `app/.../agent-shortcuts/page.tsx` — dashboard with stat cards and tile navigation to the three CRUD surfaces. |
| 2026-04-21 | claude | Created `app/.../agent-shortcuts/shortcuts/page.tsx` — mounts `<ShortcutList scope="global" />` with create/duplicate modals and routes edit to `/edit/[id]`. |
| 2026-04-21 | claude | Created `app/.../agent-shortcuts/categories/page.tsx` — mounts `<CategoryTree scope="global" />` + `<CategoryForm>` with owned delete AlertDialog. |
| 2026-04-21 | claude | Created `app/.../agent-shortcuts/content-blocks/page.tsx` — mounts `<ContentBlockList scope="global" />` + `<ContentBlockForm>`. |
| 2026-04-21 | claude | Created `app/.../agent-shortcuts/edit/[id]/page.tsx` — mounts `<ShortcutForm scope="global">` by id with duplicate modal and back-to-list action. |
| 2026-04-21 | claude | Added deprecation banner on legacy `administration/prompt-builtins/page.tsx` linking to `/administration/agent-shortcuts`. Legacy page preserved per Phase 16 plan. |
| 2026-04-22 | claude | **Route renamed**: `administration/agent-shortcuts/` → `administration/system-agents/`. All internal links updated. Subnav expanded to include new Agents and Apps tabs (filled in a follow-up — see Phase 11b below). |

## Phase 11b — System Agents umbrella (2026-04-22)

The admin shortcuts route was never a narrow "shortcuts only" surface — it's an umbrella for every global-scope agent artifact. Renamed to `system-agents` and expanded to cover:

- Builtin agents (list, build, run, create) — reuses `AgentsGrid` + `AgentBuilderPage` + `AgentRunnerPage` from the `(a)/agents/` routes
- System-scope agent apps — new `/apps` sub-route
- Existing shortcut/category/content-block surfaces (unchanged in behavior, just moved)

See: `/Users/armanisadeghi/.claude/plans/i-need-you-to-binary-patterson.md` for the full plan.
