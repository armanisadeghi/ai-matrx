"use client";

/**
 * components/official/topic-tree/TopicTree.tsx — THE hierarchical list of this
 * app (CONTRACTS §4.1, platform law 5).
 *
 * STORE-FREE ON PURPOSE. It takes flattened rows and hands back intentions;
 * every filter, expansion set and write lives in the host. That is what lets
 * the topical map, a content plan and anything else hierarchical share one
 * keyboard model, one drag contract and one row rhythm instead of the three
 * near-identical trees this repo grew before it.
 *
 * Its two parents are named because their behaviour is inherited verbatim:
 * `features/files/components/core/FileTree` (virtualisation + roving focus) and
 * `features/marketing/content-plan/components/PlanTree.tsx` (drop-on-a-row
 * reparenting, the cycle pre-check and the root drop strip).
 *
 * WHAT IT DELIBERATELY DOES NOT DO: filter, sort, fetch, expand on its own, or
 * decide what a row means. A tree that quietly re-orders or hides rows is a
 * tree whose host can no longer explain what the user is looking at.
 */

import { useEffect, useRef, useState } from "react";

import { DndContext, DragOverlay, pointerWithin, useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";

import {
  TOPIC_TREE_HOVER_DELAY_MS,
  TOPIC_TREE_INDENT_PX,
  TOPIC_TREE_ROW_HEIGHT,
  TopicTreeRow as TopicTreeRowView,
} from "./TopicTreeRow";
import type { TopicTreeProps, TopicTreeRow } from "./types";
import { TOPIC_TREE_ROOT_DROP_ID, useTopicTreeDnd } from "./useTopicTreeDnd";
import { useTopicTreeKeyboard } from "./useTopicTreeKeyboard";

export type { TopicTreeProps, TopicTreeRow };
export { TOPIC_TREE_HOVER_DELAY_MS, TOPIC_TREE_INDENT_PX, TOPIC_TREE_ROW_HEIGHT };

/**
 * Above this many rows the tree virtualises by default. Under it, every row is
 * in the DOM so Cmd-F, print and a screen reader's whole-document read all see
 * the real list.
 */
export const TOPIC_TREE_VIRTUALIZE_THRESHOLD = 200;

export function TopicTree({
  rows,
  ariaLabel,
  density = "compact",
  virtualize,
  onToggleExpand,
  onSelect,
  onActivate,
  onCheck,
  onMove,
  onRenameCommit,
  renderHover,
  emptyState,
  className,
}: TopicTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // A hover card needs a hover. On a coarse pointer the "hover" is a tap, so
  // the card would either never open or eat the tap that was meant to select.
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse)");
    setCoarsePointer(query.matches);
    const listen = (event: MediaQueryListEvent) => setCoarsePointer(event.matches);
    query.addEventListener("change", listen);
    return () => query.removeEventListener("change", listen);
  }, []);

  const rowHeight = TOPIC_TREE_ROW_HEIGHT[density];
  const virtualizing = virtualize ?? rows.length > TOPIC_TREE_VIRTUALIZE_THRESHOLD;
  const dnd = useTopicTreeDnd({ rows, onMove });

  // Called unconditionally — hooks may not depend on `virtualizing` — and only
  // read when the tree is actually virtualising.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const selectedIndex = rows.findIndex((row) => row.selected);
  const focusedIndex = (() => {
    const byId = focusedId ? rows.findIndex((row) => row.id === focusedId) : -1;
    if (byId >= 0) return byId;
    return selectedIndex >= 0 ? selectedIndex : -1;
  })();

  function scrollRowIntoView(index: number): void {
    if (virtualizing) {
      virtualizer.scrollToIndex(index, { align: "auto" });
      return;
    }
    // Looked up by INDEX, never by a selector built from the row id: an id is
    // host data and can hold a quote, a bracket or a slash, and `CSS.escape`
    // does not exist in every runtime this component is rendered in (jsdom,
    // older Safari).
    const element = containerRef.current?.querySelector(`[data-index="${index}"]`);
    if (element instanceof HTMLElement) element.scrollIntoView?.({ block: "nearest" });
  }

  function moveTo(index: number, modifiers: { shiftKey: boolean; metaKey: boolean }): void {
    const row = rows[index];
    if (!row) return;
    setFocusedId(row.id);
    setRenamingId(null);
    onSelect(row.id, modifiers);
    scrollRowIntoView(index);
  }

  /**
   * Enter / double-click / click on the selected label. When the host gave an
   * `onActivate` that wins; a tree with ONLY `onRenameCommit` treats activate
   * as "edit this label", which is what §4.1's "F2 / activate → inline editor"
   * asks for. F2 always opens the editor when renaming is available.
   */
  function activate(id: string): void {
    if (onActivate) {
      onActivate(id);
      return;
    }
    if (onRenameCommit) setRenamingId(id);
  }

  const onKeyDown = useTopicTreeKeyboard({
    rows,
    focusedIndex,
    moveTo,
    onToggleExpand,
    onActivate: activate,
    onCheck,
    startRename: onRenameCommit ? (id) => setRenamingId(id) : undefined,
  });

  function renderRow(row: TopicTreeRow, index: number) {
    return (
      <TopicTreeRowView
        row={row}
        density={density}
        focused={focusedIndex === index}
        showCheckbox={Boolean(onCheck)}
        draggable={dnd.enabled}
        renaming={renamingId === row.id}
        renderHover={renderHover}
        hoverEnabled={!coarsePointer}
        onRowClick={(event) => {
          setFocusedId(row.id);
          const alreadySelected = row.selected;
          onSelect(row.id, { shiftKey: event.shiftKey, metaKey: event.metaKey });
          if (alreadySelected && !event.shiftKey && !event.metaKey) activate(row.id);
        }}
        onRowDoubleClick={() => activate(row.id)}
        onChevronClick={() => onToggleExpand(row.id)}
        onCheckClick={() => onCheck?.(row.id)}
        onRenameCommit={(name) => {
          setRenamingId(null);
          onRenameCommit?.(row.id, name);
        }}
        onRenameCancel={() => setRenamingId(null)}
      />
    );
  }

  const body =
    rows.length === 0 ? (
      <div className="flex h-full w-full items-center justify-center p-6 text-xs text-muted-foreground">
        {emptyState ?? "Nothing here yet."}
      </div>
    ) : (
      <div
        ref={containerRef}
        role="tree"
        aria-label={ariaLabel}
        aria-multiselectable={onCheck ? true : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {virtualizing ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  data-index={item.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {renderRow(row, item.index)}
                </div>
              );
            })}
          </div>
        ) : (
          rows.map((row, index) => (
            <div key={row.id} data-index={index}>
              {renderRow(row, index)}
            </div>
          ))
        )}
      </div>
    );

  const tree = (
    <div className={cn("flex h-full w-full min-h-0 flex-col", className)}>
      {dnd.enabled && dnd.activeId ? <RootDropStrip /> : null}
      {body}
    </div>
  );

  if (!dnd.enabled) return tree;

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={pointerWithin}
      onDragStart={dnd.onDragStart}
      onDragEnd={dnd.onDragEnd}
      onDragCancel={dnd.onDragCancel}
    >
      {tree}
      <DragOverlay>
        {dnd.activeRow ? (
          <div className="rounded-sm border border-border bg-card px-2 py-1 text-xs text-foreground shadow-md">
            {dnd.activeRow.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The only way to move a row OUT of every parent. It appears while a drag is in
 * flight rather than permanently, so a static tree carries no unexplained strip
 * and the layout does not reserve space for a gesture nobody is making.
 */
function RootDropStrip() {
  const { isOver, setNodeRef } = useDroppable({ id: TOPIC_TREE_ROOT_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-7 shrink-0 items-center justify-center border-b border-primary/30 bg-primary/5 px-2 text-[11px] font-medium text-primary",
        isOver && "bg-primary/15",
      )}
    >
      Drop here to move to the top level
    </div>
  );
}
