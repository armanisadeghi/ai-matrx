"use client";

/**
 * THE CODE FILE'S ACTIONS — ONE definition of "what you can do to a saved
 * `code_files` row", shared by every surface that shows one.
 *
 * Census (2026-08-30, context-menu rollout): `code_file` renders on
 * LibraryTreeNode (the `/code` workspace's file tree — inline
 * `fileMenuSections`, not yet migrated) and CodeFileManagerWindow (the
 * floating file browser). This module is the extraction point so a third
 * surface never grows its own third copy.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item delegates to callbacks the host
 * already owns (open / rename / delete / move) — this module only decides
 * WHICH items exist and in what order. `code_file` is a registered entity
 * token (`type: "code_file"`), so Attach To / Share work everywhere this is
 * used.
 */

import { Copy as CopyIcon, Info, Pencil, RefreshCw, Trash2 } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every code-file surface can say about a right-clicked row. */
export interface CodeFileMenuRow {
  id: string;
  name: string;
  path?: string | null;
  is_readonly?: boolean | null;
}

/** THE ROW'S OWN ENTITY — Attach To / Share target this file. */
export function codeFileEntityRef(
  row: CodeFileMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "code_file", id: row.id, title: row.name };
}

export interface CodeFileMenuActions {
  onOpen: (row: CodeFileMenuRow) => void;
  onRename: (row: CodeFileMenuRow) => void;
  onDelete: (row: CodeFileMenuRow) => void;
  /** Growth (2026-08-30, CodeFileManagerWindow): copy the file's saved path. */
  onCopyPath?: (row: CodeFileMenuRow) => void;
  onProperties?: (row: CodeFileMenuRow) => void;
  onRefresh?: (row: CodeFileMenuRow) => void;
}

export function useCodeFileMenuSection(opts: {
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => CodeFileMenuRow | null;
  actions: CodeFileMenuActions;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`code-file-open`, `code-file-properties`, `code-file-rename`,
   * `code-file-delete`, `code-file-copy-path`, `code-file-refresh`).
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow, actions } = opts;
  const row = getRow();

  const withRow = (fn?: (row: CodeFileMenuRow) => void) => () => {
    const r = getRow();
    if (r && fn) fn(r);
  };

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "code-file-open",
      label: "Open",
      onSelect: withRow(actions.onOpen),
      disabled: !row,
    },
    {
      kind: "item",
      id: "code-file-properties",
      label: "Properties…",
      icon: Info,
      onSelect: withRow(actions.onProperties),
      disabled: !row || !actions.onProperties,
    },
    { kind: "separator", id: "code-file-sep-1" },
    {
      kind: "item",
      id: "code-file-rename",
      label: "Rename",
      icon: Pencil,
      disabled: !row || row?.is_readonly === true,
      onSelect: withRow(actions.onRename),
    },
    {
      kind: "item",
      id: "code-file-delete",
      label: "Delete",
      icon: Trash2,
      destructive: true,
      disabled: !row || row?.is_readonly === true,
      onSelect: withRow(actions.onDelete),
    },
    { kind: "separator", id: "code-file-sep-2" },
    {
      kind: "item",
      id: "code-file-copy-path",
      label: "Copy path",
      icon: CopyIcon,
      onSelect: withRow(actions.onCopyPath),
      disabled: !row || !actions.onCopyPath,
    },
    {
      kind: "item",
      id: "code-file-refresh",
      label: "Refresh",
      icon: RefreshCw,
      onSelect: withRow(actions.onRefresh),
      disabled: !actions.onRefresh,
    },
  ];

  return withAvailability(
    { id: "code-file", label: "This file", anchor: "after-clipboard", items },
    opts.unavailable,
  );
}
