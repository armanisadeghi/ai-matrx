"use client";

/**
 * THE ADMIN USER ROW'S ACTIONS — shared by every Users & Access table whose
 * row names a user account (directly, or as the row's primary subject: a
 * per-user usage record, a per-user acquisition record, a per-user drift
 * record). Mirrors the destination set `AdminUserRef` already uses for the
 * inline name door (`features/admin/users/components/AdminUserRef.tsx`), so
 * the right-click menu and the name's own dropdown never drift apart.
 *
 * Plain function, not a hook — same shape as `siteMenuSection` /
 * `pageMenuSection`: the host keeps the clicked row in STATE and rebuilds
 * `extraSections` off it, e.g.
 * `extraSections={[adminUserMenuSection(clickedRow)]}`.
 *
 * No entity ref: `platform.entity_types` has no token for a Supabase auth
 * user today, so Attach To / Copy-as act on the raw content only (same
 * documented gap as `AgentReviewQueueTable`'s review row).
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE, and nothing here promotes, revokes, or
 * edits an admin — "Admin level" only navigates to the existing admins page,
 * exactly like the dropdown door it mirrors.
 */

import {
  Building2,
  Gauge,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  UserRound,
} from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every Users & Access table can say about a right-clicked user. */
export interface AdminUserMenuRow {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export function adminUserMenuSection(
  row: AdminUserMenuRow | null,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const id = row ? encodeURIComponent(row.id) : "";

  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "admin-user-account",
      label: "Open account",
      icon: UserRound,
      href: row ? `/administration/users?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-organizations",
      label: "Organizations",
      icon: Building2,
      href: row ? `/administration/users/organizations?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-admin-level",
      label: "Admin level",
      icon: ShieldCheck,
      href: row ? `/administration/users/admins?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-preferences",
      label: "Preferences",
      icon: SlidersHorizontal,
      href: row ? `/administration/users/preferences?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-usage",
      label: "Usage & cost",
      icon: Gauge,
      href: row ? `/administration/users/usage?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-acquisition",
      label: "Acquisition",
      icon: UserPlus,
      href: row ? `/administration/users/acquisition?user=${id}` : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "admin-user-email",
      label: "Email user",
      icon: Mail,
      href: row ? `/administration/users/email?userId=${id}` : "#",
      disabled: !row,
    },
  ];

  return withAvailability(
    {
      id: "admin-user-actions",
      label: opts?.label ?? (row?.displayName || row?.email || "This user"),
      icon: UserRound,
      anchor: "after-compare",
      items,
    },
    opts?.unavailable,
  );
}
