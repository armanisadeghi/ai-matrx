---
status: active
updated: 2026-07-14
repos: [matrx-frontend]
vision: []
---

# User Management hub — shared Users & Access

## Vision — Arman's words

- "switch these tables to our canonical tables… only one value in each cell and that each column property has sort, filter, and all of our normal things. Use our reusable table for all of them."
- "minimal information on the users is not even names… When you have an admin page, you can't hide data from an admin." / "make sure these admin levels are shown on the main user page."
- "these tabs… need to all be connected together so that if I'm on a user, I should be able to click on a user or right click on a user and see their preferences or see their admin privileges… you could do most of it with just URLs and parameters."
- Usage "actually mentions nothing about users… no cost per user… tracking their tokens, tracking their costs… those are the things that we actually need."
- In-app message = the **dm_ system** ("dm_ is key… rich data, matrx actions and content ir"). Announcements belong in this same UI. **NOT feedback** — that's the bug tracker.
- End goal: "everything about all users properly brought into a single centralized place with all canonical tables." (The "use the app AS a user" impersonation feature is deferred to a later pass.)

## Resources

- Hub: `app/(admin)/administration/users/` (tabs in `UsersAdminLayoutClient.tsx`). Super-admin gating inherited from `app/(admin)/layout.tsx`.
- Canonical table: `components/official/matrx-data-table/MatrxDataTable.tsx` (sort/filter, Copy-for-AI, `rowActions`, `detail` side panel, `fk.href`). Exemplars: everything in `features/admin/users/components/`, plus `features/admin/relationships/components/EntityTypesClient.tsx`.
- Admin RPCs (protected resource — invoke the `protected-resources` skill first): `admin_list`, `admin_promote`, `admin_update`, `admin_revoke`. API: `app/api/admin/admins/*`.
- Test: `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/administration/users`.

## Remaining work

1. **Admins tab → canonical MatrxDataTable.** `app/(admin)/administration/users/admins/page.tsx` is still a bespoke `<Table>`. Rebuild on MatrxDataTable (level `select` filter, Copy-for-AI, add-admin in the toolbar, promote/revoke in `rowActions`, audit log in the detail panel or below) — mirror the other clients in `features/admin/users/components/`. Every mutation stays on the `admin_*` RPCs.
2. **Cross-link focus on Admins.** The Accounts row menu links to `/administration/users/admins?user=<id>`; the admins page ignores `?user`. Read it and filter/highlight that user (same `useSearchParams` pattern as `UsageTableClient` / `PreferencesTabClient`).

## Done

- Users & Access hub: 8 tabs, redirects, catalog — `app/(admin)/administration/users/`.
- Accounts, Usage & Cost (per-user), Preferences (drift + actual values), Invitations, Entitlements, Announcements all on MatrxDataTable with full data, admin-level column, Copy-for-AI, `?user` cross-links — `features/admin/users/components/`.
- Row actions: magic link, password reset (`/api/admin/users/auth-link`), email (preselect via `?userId`), **in-app DM via dm_\* system**, onboarding toggle.
- Per-user usage RPC + preferences-drift heal — `migrations/admin_user_usage_rollup.sql`, `migrations/user_preferences_legacy_drift_backfill.sql`.
