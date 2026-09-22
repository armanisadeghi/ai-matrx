-- staff_door_account_addon_dd137b_2026_09_22
-- chair-step: closes the last staff-door token, billing.account_addon, now that its Limits screen reads through /api/admin/limits/account-addons instead of the platform-admin lane
--
-- THE LAST ONE. Eighth and final file of the DD-137b staff-door sweep (GATES-3, 2026-09-22), which
-- opened at 99 tokens / 50 components.
--
-- WHY IT WAS HELD BACK. `billing.account_addon` resolves `private`, and `platform_admin_all` was
-- its ONLY client read: `features/admin/limits/service.ts` read the table straight from the browser
-- on the back of the staff lane. Dropping the policy first would have left the Limits & Knobs
-- add-on list empty with no explanation — a screen lying about the register — so the READ MOVED
-- FIRST, in the commit before this file: `GET /api/admin/limits/account-addons` gates on
-- `requireAdmin()` and then uses the admin client, the same door
-- `features/admin/shared-knowledge/server.ts` already uses and explains in its own header for the
-- reads client-side RLS deliberately hides from an admin's own session. Same columns, same
-- ordering, same pagination; a failure throws a sentence the panel already renders.
--
-- WHAT THIS FILE DOES. Declares the lane closed on the registry row so no future `iam.apply_rls`
-- re-emits it, and drops `platform_admin_all`. The RESTRICTIVE `platform_admin_only` policy stays
-- exactly where it is — it narrows, never widens. Writes are untouched: an add-on is granted
-- through `billing.addon_grant`, the super-admin SECURITY DEFINER function, because it is money.
--
-- 🚨 KNOWN WINDOW, said out loud. The route lands with the next release train; until it does, the
-- deployed bundle still makes the client-direct read and the add-on list comes back EMPTY on that
-- one internal super-admin screen. Pre-launch, no customer sees it, and the alternative was leaving
-- a standing platform-wide read of a private billing table open for hours. Named in the GATES-3
-- report rather than discovered.

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token = 'account_addon'
   and not suppress_platform_admin_lane;

drop policy platform_admin_all on billing.account_addon;
