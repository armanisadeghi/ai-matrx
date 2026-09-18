/**
 * components/official/topic-tree/types.ts — the TopicTree contract (CONTRACTS §4.1).
 *
 * Types only, so the row, the keyboard hook and the dnd hook can all name them
 * without importing the component and creating a cycle. `TopicTree.tsx`
 * re-exports both interfaces, which is where a consumer should import them.
 */

import type { ReactNode } from "react";

/** One flattened, currently-visible row. The host owns filtering and expansion. */
export interface TopicTreeRow {
  id: string;
  parentId: string | null;
  depth: number;
  label: string;
  description?: string | null;
  status?: string;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  checked?: boolean;
  /**
   * ABSENT IS NOT ZERO. A missing key means the host never loaded that count;
   * a renderer must say "not loaded", never print 0.
   */
  counts?: { pages?: number; planned?: number; keywords?: number };
  /** Slot rendered after the label (marks, dots, chips). */
  trailing?: ReactNode;
  /** Slot rendered at the far right (row actions). */
  actions?: ReactNode;
}

export interface TopicTreeProps {
  /** Flattened, visible rows in order. */
  rows: readonly TopicTreeRow[];
  ariaLabel: string;
  /** Default compact (28px rows); comfortable is 36px. */
  density?: "compact" | "comfortable";
  /** Default `rows.length > 200`. */
  virtualize?: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string, e: { shiftKey: boolean; metaKey: boolean }) => void;
  /** Enter / double-click / click on the already-selected label. */
  onActivate?: (id: string) => void;
  /** Space. Its presence is what shows the checkboxes. */
  onCheck?: (id: string) => void;
  /** Its presence is what enables dnd-kit drag-to-reparent. `null` = the root. */
  onMove?: (id: string, newParentId: string | null) => void;
  /** Its presence is what enables the F2 / activate inline rename editor. */
  onRenameCommit?: (id: string, name: string) => void;
  /** Hover-card content. Never opens on a coarse pointer. */
  renderHover?: (row: TopicTreeRow) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
}
