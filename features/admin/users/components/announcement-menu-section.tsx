"use client";

/**
 * THE ANNOUNCEMENT ROW'S ACTIONS — `SystemAnnouncement` (`@/types/feedback.types`)
 * renders on 2 surfaces: this console's `AnnouncementsTableClient` and
 * `app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx`.
 * Extracted so both inherit the same right-click actions instead of drifting;
 * the feedback surface has not adopted this yet (future adopter — its own
 * agent owns that file).
 *
 * Plain function, not a hook — same shape as `siteMenuSection`. No entity
 * ref: `platform.entity_types` has no token for a system announcement today,
 * so Attach To / Copy-as act on the raw content only.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE — both actions delegate to callbacks the
 * host already owns (`updateAnnouncement` / `deleteAnnouncement`).
 */

import { Power, Trash2 } from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

export interface AnnouncementMenuRow {
  id: string;
  title: string;
  is_active: boolean;
}

export function announcementMenuSection(
  row: AnnouncementMenuRow | null,
  handlers: {
    onToggleActive: (row: AnnouncementMenuRow) => void;
    onDelete: (row: AnnouncementMenuRow) => void;
  },
  opts?: { unavailable?: AvailabilityMap },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "announcement-toggle-active",
      label: row?.is_active ? "Deactivate" : "Activate",
      icon: Power,
      disabled: !row,
      onSelect: () => row && handlers.onToggleActive(row),
    },
    {
      kind: "item",
      id: "announcement-delete",
      label: "Delete announcement…",
      icon: Trash2,
      disabled: !row,
      destructive: true,
      onSelect: () => row && handlers.onDelete(row),
    },
  ];

  return withAvailability(
    {
      id: "announcement-actions",
      label: row?.title || "This announcement",
      icon: Power,
      anchor: "after-compare",
      items,
    },
    opts?.unavailable,
  );
}
