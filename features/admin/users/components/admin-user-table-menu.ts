// features/admin/users/components/admin-user-table-menu.ts — THE ADMIN USER MENU, AS A TABLE'S RECORD
// MENU (lane DRILL-WIRE).
//
// A package table that names a person (a drill answer's "Person" group, any row whose record kind is
// `user`) asks the host for that record's own menu through `TableDoors.menu`. On the administration
// pages that menu IS the admin user menu every Users & Access table already offers
// (`buildAdminUserMenuSection`, the same destinations as `AdminUserRef`), translated to the package's
// neutral items — so the usage page's person rows carry the old usage page's menu, declared once.
// Elsewhere a person has no menu of their own: the admin destinations are an admin seat's doors.

import type { MatrxTableMenuItem } from "@ai-matrx/design-system/data-table/menu-targets";

import { buildAdminUserMenuSection } from "./admin-user-menu-section";

/** The admin user menu for one account, as neutral table items; `go` opens a destination. */
export function adminUserTableMenu(userId: string, go: (href: string) => void): MatrxTableMenuItem[] {
  return buildAdminUserMenuSection({ id: userId }).items.flatMap((item) =>
    item.kind === "link" && !item.disabled ? [{ id: item.id, label: item.label, onSelect: () => go(item.href) }] : [],
  );
}

/** Is this address an administration page (where the admin seat's record menus apply)? */
export function isAdministrationPath(pathname: string | null | undefined): boolean {
  return pathname === "/administration" || Boolean(pathname?.startsWith("/administration/"));
}

/** A record kind's own menu on a table, for the host's `resolveEntityDoors` (none = undefined). */
export function hostEntityMenu(
  token: string,
  id: string,
  pathname: string | null | undefined,
  go: (href: string) => void,
): MatrxTableMenuItem[] | undefined {
  if (token === "user" && id && isAdministrationPath(pathname)) return adminUserTableMenu(id, go);
  return undefined;
}
