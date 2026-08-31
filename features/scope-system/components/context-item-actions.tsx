"use client";

/**
 * THE CONTEXT ITEM'S ACTIONS — ONE definition of "what you can do to a
 * `ContextItem` (a scope type's context-item definition)", shared by every
 * surface that renders one as a record.
 *
 * Census (2026-08-30, context-menu rollout): `ContextItem` renders on
 * ContextItemsWindow (this window's sidebar), ContextItemEditView,
 * EditContextItemSheet, ContextItemsHub, ScopeItemDetail, ScopesList and
 * OrgHomeScopeSection — real recurrence. This module is the fix that stops
 * each one from growing its own copy of "open / delete" — a surface calls
 * `useContextItemMenuSection` with a `getRow` reading its own clicked-row
 * state and the callbacks it already has, and gets the same items
 * everywhere.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item delegates to a callback the
 * host already owns (`openItem`, `deleteItem`) — this module only decides
 * WHICH items exist and in what order. A host missing a callback marks that
 * item `unavailable` (visible, disabled, reason as tooltip) rather than
 * silently dropping it.
 */

import { Pencil, Trash2 } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every context-item surface can say about a right-clicked row. */
export interface ContextItemMenuRow {
  id: string;
  display_name: string;
  value_type: string;
  category?: string | null;
}

/** THE ROW'S OWN ENTITY — Attach To / Share target this item. */
export function contextItemEntityRef(
  row: ContextItemMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "context_item",
    id: row.id,
    title: row.display_name,
  };
}

/** The row as readable text — a menu's `content` value. */
export function contextItemMenuContent(row: ContextItemMenuRow | null): string {
  if (!row) return "";
  return [row.display_name, row.category, row.value_type]
    .filter(Boolean)
    .join("\n");
}

export interface ContextItemMenuActions {
  openItem: (row: ContextItemMenuRow) => void;
  deleteItem: (row: ContextItemMenuRow) => void;
}

export function useContextItemMenuSection(opts: {
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => ContextItemMenuRow | null;
  actions: ContextItemMenuActions;
  label?: string;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`context-item-open`, `context-item-delete`). Contract:
   * `features/context-menu-v3/utils/availability.ts`.
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow, actions } = opts;

  const withRow = (fn: (row: ContextItemMenuRow) => void) => () => {
    const row = getRow();
    if (row) fn(row);
  };

  const row = getRow();

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "context-item-open",
      label: "Open item",
      icon: Pencil,
      onSelect: withRow(actions.openItem),
      disabled: !row,
    },
    {
      kind: "item",
      id: "context-item-delete",
      label: "Delete item",
      icon: Trash2,
      onSelect: withRow(actions.deleteItem),
      disabled: !row,
      destructive: true,
    },
  ];

  return withAvailability(
    {
      id: "context-item",
      label: opts.label ?? "This item",
      anchor: "after-compare",
      items,
    },
    opts.unavailable,
  );
}
