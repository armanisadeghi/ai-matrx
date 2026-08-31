"use client";

/**
 * THE CAPTURE ITEM'S ACTIONS — ONE definition of "what you can do to a
 * captured product item", shared by every surface that shows one.
 *
 * Census (2026-08-30, context-menu rollout): `product_capture_item` /
 * `CaptureItem` renders on AllItemsTable (the manage table), ItemDetailView
 * (the single-item workspace), ItemsSheet (the capture-screen review drawer)
 * and pipeline/ItemWorkspace — four real surfaces. This module is the fix
 * that stops each one from growing its own copy of "view / capture more /
 * mark ready / delete": a surface calls `useCaptureItemMenuSection` with a
 * `getRow` reading its own clicked-row state and the callbacks it already
 * has, and gets the same items everywhere.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item delegates to callbacks the host
 * already owns (`openView`, `openCapture`, `markReady`, `requestDelete`) —
 * this module only decides WHICH items exist and in what order, never how a
 * write happens. A host missing a callback marks that item `unavailable`
 * (visible, disabled, reason as tooltip) rather than silently dropping it.
 */

import { Camera, CheckCircle2, Eye, RefreshCw, Trash2 } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every capture-item surface can say about a right-clicked row. */
export interface CaptureItemMenuRow {
  id: string;
  code: string | null;
  status: "capturing" | "captured" | "processed";
}

/** THE ROW'S OWN ENTITY — Attach To / Share target this item. */
export function captureItemEntityRef(
  row: CaptureItemMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "product_capture_item",
    id: row.id,
    title: row.code ?? "Captured item",
  };
}

export interface CaptureItemMenuActions {
  openView: (row: CaptureItemMenuRow) => void;
  openCapture: (row: CaptureItemMenuRow) => void;
  markReady: (row: CaptureItemMenuRow) => void;
  requestDelete: (row: CaptureItemMenuRow) => void;
}

export function useCaptureItemMenuSection(opts: {
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => CaptureItemMenuRow | null;
  actions: CaptureItemMenuActions;
  /** Label for the section heading. */
  label?: string;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`capture-item-view`, `capture-item-capture`,
   * `capture-item-mark-ready`, `capture-item-delete`). Contract:
   * `features/context-menu-v3/utils/availability.ts`.
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow, actions } = opts;

  const withRow = (fn: (row: CaptureItemMenuRow) => void) => () => {
    const row = getRow();
    if (row) fn(row);
  };

  const row = getRow();
  const canMarkReady =
    !!row && (row.status === "capturing" || row.status === "processed");

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "capture-item-view",
      label: "View item",
      icon: Eye,
      onSelect: withRow(actions.openView),
      disabled: !row,
    },
    {
      kind: "item",
      id: "capture-item-capture",
      label: "Capture more",
      icon: Camera,
      onSelect: withRow(actions.openCapture),
      disabled: !row,
    },
    {
      kind: "item",
      id: "capture-item-mark-ready",
      label: row?.status === "processed" ? "Reprocess" : "Mark ready",
      icon: row?.status === "processed" ? RefreshCw : CheckCircle2,
      onSelect: withRow(actions.markReady),
      disabled: !canMarkReady,
      description:
        row && !canMarkReady ? "Already queued for processing" : undefined,
    },
    {
      kind: "item",
      id: "capture-item-delete",
      label: "Delete item",
      icon: Trash2,
      onSelect: withRow(actions.requestDelete),
      disabled: !row,
      destructive: true,
    },
  ];

  return withAvailability(
    {
      id: "capture-item",
      label: opts.label ?? "This item",
      anchor: "after-compare",
      items,
    },
    opts.unavailable,
  );
}
