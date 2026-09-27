"use client";

/**
 * LayersPanel — everything on the board as a list (Claude Design's right
 * panel, Figma's layers): frames with the tiles inside them, loose tiles,
 * then drawn marks. Click selects and flies there; double-click renames.
 * The list is the board's accessible index — every item is reachable by
 * keyboard even when it is a speck on the plane.
 */

import { useState } from "react";
import { Frame, PenLine, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { rectsIntersect, type Rect } from "../engine/camera";
import { useSelectedTile, useSpatialStore } from "../engine/react";

export interface LayerItem {
  id: string;
  title: string;
  rect: Rect;
  icon?: LucideIcon;
}

export function LayersPanel({
  frames,
  tiles,
  shapeCount,
  onRename,
  onClose,
}: {
  frames: LayerItem[];
  tiles: LayerItem[];
  shapeCount: number;
  onRename?: (id: string, title: string) => void;
  onClose: () => void;
}) {
  const inFrame = (t: LayerItem) => frames.find((f) => rectsIntersect(f.rect, t.rect) && contains(f.rect, t.rect));
  const loose = tiles.filter((t) => !inFrame(t));

  return (
    <aside
      data-spatial-chrome
      data-spatial-focus
      aria-label="Layers"
      className="absolute bottom-4 right-4 top-16 z-30 flex w-64 flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur"
    >
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <span className="flex-1 text-xs font-semibold text-foreground">Layers</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {frames.map((f) => (
          <div key={f.id}>
            <LayerRow item={{ ...f, icon: Frame }} target={`frame:${f.id}`} bold onRename={onRename} />
            {tiles
              .filter((t) => inFrame(t)?.id === f.id)
              .map((t) => (
                <LayerRow key={t.id} item={t} target={t.id} indent onRename={onRename} />
              ))}
          </div>
        ))}
        {loose.map((t) => (
          <LayerRow key={t.id} item={t} target={t.id} onRename={onRename} />
        ))}
        {shapeCount > 0 && (
          <p className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
            <PenLine className="size-3.5" />
            {`${shapeCount} drawn ${shapeCount === 1 ? "mark" : "marks"}`}
          </p>
        )}
        {frames.length + tiles.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">The board is empty.</p>
        )}
      </div>
    </aside>
  );
}

function LayerRow({
  item,
  target,
  bold,
  indent,
  onRename,
}: {
  item: LayerItem;
  target: string;
  bold?: boolean;
  indent?: boolean;
  onRename?: (id: string, title: string) => void;
}) {
  const store = useSpatialStore();
  const selected = useSelectedTile() === item.id;
  const [editing, setEditing] = useState(false);
  const Icon = item.icon;

  if (editing && onRename) {
    return (
      <input
        autoFocus
        defaultValue={item.title}
        aria-label="Rename"
        onBlur={(e) => {
          setEditing(false);
          const next = e.target.value.trim();
          if (next && next !== item.title) onRename(item.id, next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
        className={cn("mx-2 my-0.5 w-[calc(100%-1rem)] rounded border border-ring bg-background px-2 py-1 text-xs", indent && "ml-6 w-[calc(100%-2rem)]")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        store.select(item.id);
        store.fitItem(target);
      }}
      onDoubleClick={() => onRename && setEditing(true)}
      title={item.title}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent",
        indent && "pl-7",
        selected ? "bg-primary/10 text-primary" : "text-foreground",
        bold && "font-semibold",
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.w <= outer.x + outer.w + 1 &&
    inner.y + inner.h <= outer.y + outer.h + 1
  );
}
