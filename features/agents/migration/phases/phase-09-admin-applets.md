# Phase 9 — Admin Applets Management

**Status:** complete
**Owner:** claude (phase-09)
**Prerequisites:** Phase 8
**Unblocks:** —

## Goal

Mirror `administration/prompt-apps` for Applets: list, feature/verify, moderate. Reuse shared components from `features/applets/` (Phase 8).

## Success criteria
- [x] Admin route under `app/(authenticated)/(admin-auth)/administration/applets/`.
- [x] Feature flag, verify, deactivate controls.
- [x] Rate limit override UI.

## Routes shipped

```
app/(authenticated)/(admin-auth)/administration/applets/
├── layout.tsx                          # metadata + layout client wrapper
├── AppletsAdminLayoutClient.tsx      # tabbed nav (Dashboard / Apps / Categories / Executions)
├── page.tsx                            # dashboard — counts, featured grid, recently updated
├── apps/page.tsx                       # full table: filter by name/slug/status/category/featured/verified/creator + row-level feature/verify + "Manage" opens edit
├── categories/page.tsx                 # sidebar + detail CRUD for agent_app_categories (10 seeded)
├── executions/page.tsx                 # tabbed Executions + Errors with resolve/unresolve
└── edit/[id]/page.tsx                  # admin edit: AppletAdminActions + Metadata modal + AppletEditor tabs
```

## Design summary

**Admin moderation surface.** Shipped a new reusable `AppletAdminActions` component under `features/applets/components/` that renders all platform-admin controls: feature, verify, public/private, status dropdown (draft / published / archived / suspended with confirm), rate-limit override form, and delete (with AlertDialog confirm). Suspend + delete gates go through AlertDialog — no native `confirm()`. The component takes an `onUpdate(patch)` callback so admin/user/org scopes can point it at different mutations.

**Service layer.** Added `lib/services/applets-admin-service.ts` — mirrors `prompt-apps-admin-service.ts` 1:1 with helpers for categories (list/create/update/delete), apps (list with `creator_email` join via `get_user_emails_by_ids` RPC, get-by-id, admin-patch), executions (list with app join), errors (list + resolve/unresolve), and rate limits (list + block/unblock). RLS enforces admin-only writes (DB migration policies already gate `agent_apps` mutations to `is_platform_admin()`).

**Reuse of Phase 8 components.**
- `AppletsGrid` — mounted in the dashboard for featured + recently-updated sections with `hrefFor` pointing at `/administration/applets/edit/[id]`.
- `AppletEditor` — mounted in the edit page under the "Component Code" tab for Babel-editable JSX/TSX.
- `UpdateAppletModal` — mounted in the edit page as the metadata (name/tagline/description/status) editor.
- `AppletListCard` — used transitively via `AppletsGrid`.

**Component edit wiring.** The edit page hits `PATCH /api/applets/[id]` (shipped in Phase 8) for component code + metadata saves, and the admin-only fields (`is_featured`, `is_verified`, `is_public`, `rate_limit_*`, `status`) flow through the service function `updateAppletAdmin` which hits the table directly (RLS allows it for platform admins).

**Page wrapper** uses the mandated `h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden`. Edit page layout bypasses the admin tab nav (matching the agent-shortcuts pattern — the layout client returns `children` directly on `/edit/`).

**Mobile rules.** Inputs everywhere are `text-[16px]`, nav bar is horizontally scrollable on narrow viewports, and `UpdateAppletModal` already uses Drawer on mobile (inherited from Phase 8). Edit page tab nav uses horizontal scroll instead of stacking because there are only two tabs.

## Reuse summary

| Component | Source | Where mounted |
|---|---|---|
| `AppletsGrid` | Phase 8, `features/applets/components/layouts/` | Dashboard (featured + recent) |
| `AppletEditor` | Phase 8 | `/edit/[id]` — Component Code tab |
| `UpdateAppletModal` | Phase 8 | `/edit/[id]` — metadata edit button |
| `AppletAdminActions` | **Phase 9 (new)** | `/edit/[id]` — Admin Moderation card |
| `renderIcon` | `components/official/icons/` | Categories page sidebar + preview |
| `matchesSearch` | `utils/search-scoring` | Categories search filter |

## New Phase 9 additions (non-duplicating)

Everything here is new admin-specific glue; nothing duplicates Phase 8 or Phase 11 work.

- `features/applets/components/AppletAdminActions.tsx` — reusable admin-scope action bar (feature/verify/public/status/rate-limit overrides/delete). Exported from `features/applets/index.ts`.
- `lib/services/applets-admin-service.ts` — thin Supabase client wrapper. Mirrors the `prompt-apps-admin-service.ts` shape for a painless visual diff.

## Cross-links

- Added a deprecation banner on `app/(authenticated)/(admin-auth)/administration/prompt-apps/page.tsx` pointing to `/administration/applets`. Legacy page preserved — Phase 16 removes it.

## Open items / deferred

- **Rate-limit row table.** Phase 8 tracks per-identifier rate limits in `agent_app_rate_limits`. The executions surface does not yet include a rate-limits table because the first-order admin need (overriding the per-app caps) is solved via `AppletAdminActions.showRateLimits`. A follow-up can add an `/administration/applets/rate-limits/` route that uses `fetchAppletRateLimits` / `unblockAppletRateLimit` / `blockAppletRateLimit` (all already in the service).
- **Auto-create app flow.** `CreateAppletForm` from Phase 8 requires an `agents: AgentOption[]` prop. A first-class "admin creates new Applet" flow needs an agent-discovery query. Out of scope for this phase — the admin use case is moderating existing user apps, not creating new ones.
- **Types cast.** The service uses `as unknown as any` on the Supabase client in three spots pending DB type regeneration (same pattern Phase 8 used). Will clean up after `npx supabase gen types` runs post-migration.

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-04-21 | claude (phase-09) | Created `lib/services/applets-admin-service.ts` with category/app/execution/error/rate-limit helpers and `get_user_emails_by_ids` RPC join. |
| 2026-04-21 | claude (phase-09) | Added `features/applets/components/AppletAdminActions.tsx` (feature/verify/public/status/rate-limit/delete) and exported from the feature barrel. |
| 2026-04-21 | claude (phase-09) | Shipped `app/.../applets/manage/layout.tsx` + `AppletsAdminLayoutClient.tsx` with tabbed nav (Dashboard / Apps / Categories / Executions) mirroring the agent-shortcuts admin pattern. |
| 2026-04-21 | claude (phase-09) | Shipped `page.tsx` dashboard: stat cards, tile nav, featured + recently-updated `AppletsGrid` sections. |
| 2026-04-21 | claude (phase-09) | Shipped `apps/page.tsx` table with name/slug/status/category/featured/verified/creator filters, 8-column sort, and row-level feature/verify toggles. |
| 2026-04-21 | claude (phase-09) | Shipped `categories/page.tsx` — sidebar + detail CRUD for `agent_app_categories` with sort-order reorder and AlertDialog delete. |
| 2026-04-21 | claude (phase-09) | Shipped `executions/page.tsx` — tabbed Executions + Errors tables with resolve / unresolve + full detail dialog. |
| 2026-04-21 | claude (phase-09) | Shipped `edit/[id]/page.tsx` mounting `AppletAdminActions`, `UpdateAppletModal`, and `AppletEditor` in a two-tab (Admin / Code) layout. |
| 2026-04-21 | claude (phase-09) | Added deprecation banner on legacy `administration/prompt-apps/page.tsx` linking to the new admin route. Legacy page preserved for Phase 16. |
