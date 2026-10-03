"use client";

// features/unified-data/actions/DataMenuProvider.tsx — lane TABLE-ACTIONS (wave 1)
//
// THE DATA SURFACES' RIGHT-CLICK IS THE PROPOSED MENU (the founder, 2026-10-03: "use the lane's best
// menu for the Data surfaces now"). Every right-click under this provider — the Data home's rows
// and cards, the table page — is arranged by `proposedArrangement` (the object's verbs as the icon
// strip, its feature rows, one "More table options", then Intelligence and the platform rows),
// drawn large and without the header line. The kebab ⋯ menus are untouched: they draw the table's
// one action list through `toItemMenuConfig` / `ObjectActionMenuItems`.
//
// ONE FILE ON PURPOSE: when the arrangement goes platform-wide, this provider is deleted and its
// two mounts (`DataHomeList`, `UnifiedTableBody`) lose one wrapper each.

import type { ReactNode } from "react";
import { MenuRegroupProvider, type MenuRegroupValue } from "@/features/context-menu-v3/regroup/RegroupContext";
import { proposedArrangement } from "@/features/context-menu-v3/proposed/proposed-arrangement";

const DATA_MENU: MenuRegroupValue = {
  grouping: null,
  mergeSameName: false,
  transform: (target, resolved) => proposedArrangement(target, resolved, { noun: "table" }),
  size: "large",
  hideHeader: true,
};

export function DataMenuProvider({ children }: { children: ReactNode }) {
  return <MenuRegroupProvider value={DATA_MENU}>{children}</MenuRegroupProvider>;
}
