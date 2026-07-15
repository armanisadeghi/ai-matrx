---
status: blocked
updated: 2026-07-14
repos: [matrx-frontend]
vision: []
---

# User Management hub — canonical Users & Access

## Vision — Arman's words

Verbatim from the request that drove this work:

- "switch these tables to our canonical tables that ensure there's only one value in each cell and that each column property has sort, filter, and all of our normal things. Use our reusable table for all of them."
- "This call having email and ID in the same field can absolutely not happen." / "minimal information on the users is not even names and all of the core information… When you have an admin page, you can't hide data from an admin."
- Row actions wanted: "send people magic links… reset their passwords… click a button to email them… click a button to send them an in app message, which is a… important feature that we have. And then we need copy for AI buttons for individual rows. And if we do a sort filter, whatever is displayed on the page."
- "these tabs and things need to all be connected together so that if I'm on a user, I should be able to click on a user or right click on a user and see their preferences or see their admin privileges… you could do most of it with just URLs and parameters."
- "make sure these admin levels are shown on the main user page."
- Usage: "you have a tab for usage and cost, but it actually mentions nothing about users… no cost per user… no usage at all for requests or tracking their tokens, tracking their costs… those are the things that we actually need."
- End goal: "everything about all users properly brought into a single centralized place with all canonical tables." (The bigger "use the app AS a user" impersonation feature is explicitly deferred to a later pass.)

## Resources

- Hub: `app/(admin)/administration/users/` (tabs in `UsersAdminLayoutClient.tsx`). Super-admin gating inherited from `app/(admin)/layout.tsx`.
- Canonical table: `components/official/matrx-data-table/MatrxDataTable.tsx` (+ `types.ts`). Gives per-column sort/filter, Copy-for-AI (row + view), `rowActions`, `detail` side panel, `fk.href`. Exemplar: `features/admin/relationships/components/EntityTypesClient.tsx`.
- Shared module: `features/admin/users/` (`types.ts`, `constants.ts`, `components/*`).
- APIs (all super-admin gated): `app/api/admin/users/route.ts` (full roster), `.../auth-link/route.ts` (magic link / recovery), `.../usage/route.ts`, `.../preferences/route.ts`, `.../preferences-drift/route.ts`, `app/api/admin/email/route.ts`, `app/api/admin/admins/*`, `app/api/admin/invitation-requests/*`.
- DB: roster join = `auth.admin.listUsers()` + `users.profiles` (display_name/avatar) + `admin_list()` (levels). Per-user usage RPC `chat.admin_user_usage_rollup(from,to)` (stored cost/tokens on `chat.user_request`). Admin mutations are a **protected resource** — go through `admin_promote/admin_update/admin_revoke` RPCs only (invoke the `protected-resources` skill before touching `admins`).
- Test: log in via `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/administration/users`. Tabs: `/administration/users`, `/administration/users/{preferences,admins,invitations,entitlements,usage,email}`.

## Remaining work

1. **Admins tab → canonical MatrxDataTable.** `app/(admin)/administration/users/admins/page.tsx` is still a bespoke `<Table>`. Rebuild on MatrxDataTable (level `select` filter, Copy-for-AI, add-admin in the toolbar, promote/revoke in `rowActions`, the audit log below or in the detail panel) mirroring the other tab clients in `features/admin/users/components/`. Keep every mutation on the `admin_*` RPCs — read the `protected-resources` skill first.
2. **Cross-link focus on Admins.** The Accounts row action links to `/administration/users/admins?user=<id>`; the admins page ignores the param. Read `?user` and filter/highlight that user (same `useSearchParams` pattern as `UsageTableClient` / `PreferencesTabClient`).
3. **"Send in-app message" row action.** Not built — no single-user in-app message mechanism exists (see Decisions). Once decided, add it to the Accounts `rowActions` dropdown in `AccountsTableClient.tsx` (a placeholder slot pattern is already there alongside magic-link/reset/email).

## Done

- Users & Access hub consolidation (7 tabs, redirects, catalog) — see `app/(admin)/administration/users/` + `next.config.js`.
- Accounts, Usage & Cost (per-user), Preferences (drift + actual values), Invitations, Entitlements all on MatrxDataTable with full data, admin-level column, Copy-for-AI, and `?user` cross-links — see `features/admin/users/components/`.
- Row actions: magic link, password reset (`/api/admin/users/auth-link`), email (preselect via `?userId`), onboarding toggle.
- Per-user usage/cost RPC + preferences-drift heal system — see `migrations/admin_user_usage_rollup.sql`, `migrations/user_preferences_legacy_drift_backfill.sql`.

## Decisions needed

**In-app message to a single user — which mechanism?**
Situation: The Accounts tab wants a "send this user an in-app message" button, but the codebase has no single-user in-app messaging path. What exists: `public.system_announcements` (broadcast to ALL users on next login), `feedback_user_messages` (admin↔user thread scoped to a feedback item), and a peer DM system (`dm_*` tables, `POST /api/messages/conversations`). None is an admin→one-user push.
Decide: (a) repurpose the DM system — admin opens/sends a DM conversation to the user (fastest, reuses `dm_*`); (b) build a proper admin→user notification table + delivery surface (in-app toast/inbox) — larger but the "real" feature; or (c) point the button at feedback-thread messaging. Which is the "important feature we have" you had in mind?
