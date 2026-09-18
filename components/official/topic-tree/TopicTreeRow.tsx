"use client";

/**
 * components/official/topic-tree/TopicTreeRow.tsx — ONE row of {@link TopicTree}.
 *
 * Store-free and presentational: every decision arrives as a prop so the same
 * row draws a topical map, a plan, or anything else hierarchical.
 *
 * THE ROW IS THE HIT TARGET. The label, the counts and the indent are all
 * inside one `<div role="treeitem">` that handles the click — the chevron and
 * the checkbox stop propagation because expanding is not selecting and
 * checking is not selecting. That is why there is no nested `<button>` around
 * the label: a button inside the row would steal focus from the tree and break
 * the roving-focus keyboard model (§4.1).
 */

import type { ReactNode } from "react";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight } from "lucide-react";

import { Checkbox, HoverCard, HoverCardContent, HoverCardTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { TopicTreeRenameInput } from "./TopicTreeRenameInput";
import type { TopicTreeRow as TopicTreeRowData } from "./types";

/** Compact is the default everywhere; comfortable is for touch and presentation. */
export const TOPIC_TREE_ROW_HEIGHT = { compact: 28, comfortable: 36 } as const;

/** One depth step. 16px is the 4px-grid step VS Code, Finder and Linear all land on. */
export const TOPIC_TREE_INDENT_PX = 16;

/** How long the pointer rests before a hover card opens. Never fires on touch. */
export const TOPIC_TREE_HOVER_DELAY_MS = 350;

export interface TopicTreeRowProps {
  row: TopicTreeRowData;
  density: "compact" | "comfortable";
  /** The roving-focus row. Exactly one row in the tree carries this. */
  focused: boolean;
  showCheckbox: boolean;
  draggable: boolean;
  /** True while this row's label is being edited in place. */
  renaming: boolean;
  renameMaxLength?: number;
  renderHover?: (row: TopicTreeRowData) => ReactNode;
  /** False on a coarse pointer — a hover card that needs a hover is a trap on touch. */
  hoverEnabled: boolean;
  onRowClick: (event: React.MouseEvent) => void;
  onRowDoubleClick: () => void;
  onChevronClick: () => void;
  onCheckClick: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}

export function TopicTreeRow({
  row,
  density,
  focused,
  showCheckbox,
  draggable,
  renaming,
  renameMaxLength,
  renderHover,
  hoverEnabled,
  onRowClick,
  onRowDoubleClick,
  onChevronClick,
  onCheckClick,
  onRenameCommit,
  onRenameCancel,
}: TopicTreeRowProps) {
  // Both hooks are safe without a DndContext — @dnd-kit/core ships a default
  // internal context — so they are called unconditionally and simply disabled
  // when the host gave no `onMove`. That keeps the hook order identical for
  // every row whether or not the tree is reorderable.
  const drag = useDraggable({ id: row.id, disabled: !draggable });
  const drop = useDroppable({ id: row.id, disabled: !draggable });

  const height = TOPIC_TREE_ROW_HEIGHT[density];
  const indent = row.depth * TOPIC_TREE_INDENT_PX;

  const label = (
    <span
      className={cn(
        "truncate",
        row.selected ? "font-medium text-foreground" : "text-foreground/90",
      )}
    >
      {row.label}
    </span>
  );

  return (
    <div
      ref={drop.setNodeRef}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={row.selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-checked={showCheckbox ? Boolean(row.checked) : undefined}
      data-topic-tree-row={row.id}
      data-focused={focused ? "true" : undefined}
      onClick={onRowClick}
      onDoubleClick={onRowDoubleClick}
      style={{ height, paddingLeft: indent + 4 }}
      className={cn(
        "group relative flex w-full cursor-default select-none items-center gap-1.5 pr-2 text-xs",
        // Selection: a primary wash plus a left rail, the same treatment the
        // plan tree and the file tree use — unmistakable in both themes without
        // inventing a colour.
        row.selected ? "bg-primary/10" : "hover:bg-accent",
        focused && "ring-1 ring-inset ring-primary/40",
        drop.isOver && draggable && "bg-primary/15",
        drag.isDragging && "opacity-50",
      )}
    >
      {row.selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 bg-primary"
        />
      ) : null}

      {/* Depth guides. One hairline per ancestor level: the tree stays readable
          at depth 6 without a box around anything. */}
      {Array.from({ length: row.depth }, (_, level) => (
        <span
          key={level}
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-border/60"
          style={{ left: level * TOPIC_TREE_INDENT_PX + 9 }}
        />
      ))}

      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation();
            onChevronClick();
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", row.expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="h-4 w-4 shrink-0" />
      )}

      {showCheckbox ? (
        <span
          onClick={(event) => {
            event.stopPropagation();
            onCheckClick();
          }}
          className="flex shrink-0 items-center"
        >
          <Checkbox
            checked={Boolean(row.checked)}
            tabIndex={-1}
            aria-label={`Select ${row.label}`}
            onCheckedChange={() => onCheckClick()}
            className="h-3.5 w-3.5"
          />
        </span>
      ) : null}

      <span
        ref={draggable ? drag.setNodeRef : undefined}
        {...(draggable ? drag.listeners : {})}
        {...(draggable ? drag.attributes : {})}
        // The draggable handle is the label area, not the whole row: the
        // chevron and the checkbox must stay clickable at any drag distance.
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        {renaming ? (
          <TopicTreeRenameInput
            value={row.label}
            maxLength={renameMaxLength}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : renderHover && hoverEnabled ? (
          <HoverCard openDelay={TOPIC_TREE_HOVER_DELAY_MS} closeDelay={80}>
            <HoverCardTrigger asChild>{label}</HoverCardTrigger>
            <HoverCardContent
              align="start"
              side="right"
              className="w-80 text-xs"
            >
              {renderHover(row)}
            </HoverCardContent>
          </HoverCard>
        ) : (
          label
        )}

        {row.trailing ? (
          <span className="flex shrink-0 items-center gap-1">{row.trailing}</span>
        ) : null}
      </span>

      {row.actions ? (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {row.actions}
        </span>
      ) : null}
    </div>
  );
}
