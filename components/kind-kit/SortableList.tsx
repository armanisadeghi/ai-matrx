"use client";

/**
 * SortableList — drag-to-reorder list for kind components.
 *
 * The mandated reorder UX, built once: while a row is dragged, the rows it
 * passes DISPLACE (translate) out of the way and a SHADOWED placeholder marks
 * exactly where the item will land. Native HTML5 drag-and-drop (no deps); a
 * grab handle starts the drag (so text and inputs inside rows stay usable);
 * up/down buttons are the keyboard + touch fallback; `onRemove` adds an inline
 * remove control. Contract: `components/kind-kit/README.md`.
 *
 * Sandbox-safe by construction: imports only react, lucide-react, shadcn ui,
 * and `cn`.
 */

import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SortableRenderContext {
  index: number;
  /** True for the row currently being dragged (rendered as the placeholder). */
  isDragging: boolean;
}

export interface SortableListProps<T> {
  /** Current order. Treated as read-only; the new order arrives via `onReorder`. */
  items: readonly T[];
  /**
   * Stable key per item. Default: the item itself when it is a string, else
   * `item.id` / `item.key` when present, else the index (unstable — pass one).
   */
  getKey?: (item: T, index: number) => string;
  /** Called with the full reordered array after a drop or an arrow press. */
  onReorder: (items: T[]) => void;
  /**
   * Row content. Default: the item when it is a string/number, else its
   * `label` / `title` / `name` / `text` field, else `JSON.stringify`.
   */
  renderItem?: (item: T, ctx: SortableRenderContext) => React.ReactNode;
  /** When set, every row gets an inline remove (X) control. */
  onRemove?: (item: T, index: number) => void;
  /** Disables drag, arrows and remove (rows still render). */
  disabled?: boolean;
  /** Hide the up/down arrow buttons (drag only). Default false. */
  hideArrows?: boolean;
  /** Shown when `items` is empty. */
  emptyState?: React.ReactNode;
  /** Wrapper `<ul>` className. */
  className?: string;
  /** Per-row className (applied to every `<li>`). */
  itemClassName?: string;
  /** Accessible name for the list. */
  ariaLabel?: string;
}

function defaultKey<T>(item: T, index: number): string {
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const rec = item as Record<string, unknown>;
    if (typeof rec.id === "string" || typeof rec.id === "number")
      return String(rec.id);
    if (typeof rec.key === "string") return rec.key;
  }
  return String(index);
}

function defaultRender<T>(item: T): React.ReactNode {
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const rec = item as Record<string, unknown>;
    for (const k of ["label", "title", "name", "text"]) {
      if (typeof rec[k] === "string") return rec[k] as string;
    }
    return JSON.stringify(item);
  }
  return String(item);
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

interface DragState {
  from: number;
  over: number;
  /**
   * Row rects captured at drag start, relative to the list's top — a fixed
   * ruler: the pointer's position on it decides the landing slot, so the
   * target never depends on which (already displaced) row fires the event.
   */
  rects: { top: number; bottom: number; height: number }[];
}

export function SortableList<T>({
  items,
  getKey = defaultKey,
  onReorder,
  renderItem,
  onRemove,
  disabled = false,
  hideArrows = false,
  emptyState,
  className,
  itemClassName,
  ariaLabel,
}: SortableListProps<T>) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [armed, setArmed] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const rowRefs = React.useRef<(HTMLLIElement | null)[]>([]);

  const canInteract = !disabled;

  const handleDragStart = (index: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (!canInteract || armed !== index) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    // Firefox requires data to start a drag.
    e.dataTransfer.setData("text/plain", String(index));
    const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
    const rects = rowRefs.current.slice(0, items.length).map((el) => {
      const r = el ? el.getBoundingClientRect() : new DOMRect();
      return { top: r.top - listTop, bottom: r.bottom - listTop, height: r.height };
    });
    setDrag({ from: index, over: index, rects });
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
    const y = e.clientY - listTop;
    let over = drag.rects.length - 1;
    for (let i = 0; i < drag.rects.length; i++) {
      const r = drag.rects[i];
      if (r && y < r.bottom) {
        over = i;
        break;
      }
    }
    if (over !== drag.over) setDrag({ ...drag, over });
  };

  const finish = () => {
    setDrag(null);
    setArmed(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (drag && drag.from !== drag.over) {
      onReorder(moveItem(items, drag.from, drag.over));
    }
    finish();
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    onReorder(moveItem(items, from, to));
  };

  /** Translate (px) for row `index` while a drag is in flight. */
  const translateFor = (index: number): number => {
    if (!drag) return 0;
    const { from, over, rects } = drag;
    if (from === over) return 0;
    const dragged = rects[from];
    if (!dragged) return 0;
    // Slot size = row height + the gap to its neighbour (so displaced rows
    // land exactly on the grid the dragged row vacates).
    const neighbour = rects[from + 1] ?? rects[from - 1];
    const gap = neighbour
      ? Math.max(
          0,
          from + 1 < rects.length
            ? neighbour.top - dragged.bottom
            : dragged.top - neighbour.bottom,
        )
      : 0;
    const slot = dragged.height + gap;
    if (index === from) {
      const target = rects[over];
      if (!target) return 0;
      return over > from
        ? target.bottom - dragged.bottom
        : target.top - dragged.top;
    }
    if (from < over && index > from && index <= over) return -slot;
    if (over < from && index >= over && index < from) return slot;
    return 0;
  };

  if (items.length === 0) {
    return emptyState !== undefined ? (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {emptyState}
      </div>
    ) : null;
  }

  return (
    <ul
      role="list"
      aria-label={ariaLabel}
      ref={listRef}
      className={cn("flex flex-col gap-1.5", className)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {items.map((item, index) => {
        const key = getKey(item, index);
        const isDragging = drag?.from === index;
        const translate = translateFor(index);
        return (
          <li
            key={key}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            draggable={canInteract && armed === index}
            onDragStart={handleDragStart(index)}
            onDragEnd={finish}
            style={{
              transform: translate ? `translate3d(0, ${translate}px, 0)` : undefined,
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm text-foreground",
              "transition-transform duration-150 ease-out will-change-transform",
              isDragging
                ? "border-dashed border-primary/60 bg-primary/5 shadow-inner"
                : "border-border bg-card",
              itemClassName,
            )}
          >
            <button
              type="button"
              aria-label="Drag to reorder"
              disabled={!canInteract}
              onPointerDown={() => canInteract && setArmed(index)}
              onPointerUp={() => !drag && setArmed(null)}
              className={cn(
                "flex h-7 w-6 shrink-0 touch-none items-center justify-center rounded text-muted-foreground",
                canInteract
                  ? "cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing"
                  : "opacity-40",
              )}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div
              className={cn(
                "min-w-0 flex-1 break-words",
                isDragging && "opacity-40",
              )}
            >
              {renderItem
                ? renderItem(item, { index, isDragging })
                : defaultRender(item)}
            </div>
            {!hideArrows && (
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Move up"
                  disabled={!canInteract || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Move down"
                  disabled={!canInteract || index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove"
                disabled={!canInteract}
                onClick={() => onRemove(item, index)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
