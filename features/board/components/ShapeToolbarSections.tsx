"use client";

/**
 * The floating toolbar's sections for drawn shapes (stroke colour, fill,
 * weight / dash / opacity, text size and alignment) and for any selection
 * (layer order, duplicate, delete). Each change is ONE undo step across
 * everything selected (`BoardStore.restyleShapes`). See `SelectionToolbar`.
 */

import { useSyncExternalStore } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  Copy,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import type { BoardStore, BoardTileBase } from "../board/board-store";
import {
  type BoardShape,
  type ShapeStyle,
  FILL_ALPHA,
  isBoxKind,
  isDrawing,
  shapeColorCss,
  styleOf,
  textCapable,
} from "../engine/shapes";
import {
  ChoiceRow,
  ColorSwatches,
  type SelectionToolbarSection,
  SelectionToolbarButton,
  SelectionToolbarMenu,
} from "./SelectionToolbar";

type AnyBoard = BoardStore<BoardTileBase>;

/** The one value every shape shares, or null when they differ. */
function common<K extends keyof ShapeStyle>(shapes: readonly BoardShape[], key: K): ShapeStyle[K] | null {
  const first = styleOf(shapes[0])[key];
  return shapes.every((s) => styleOf(s)[key] === first) ? first : null;
}

export function shapeStyleSection<T extends BoardTileBase>(board: BoardStore<T>): SelectionToolbarSection {
  const b = board as unknown as AnyBoard;
  return {
    key: "shape-style",
    scope: "type",
    label: "Shapes",
    // Drawings only: sticky notes and plain text have their own sections (CanvasTextToolbarSections).
    applies: (ids) => ids.some((id) => {
      const sh = b.getShape(id);
      return !!sh && isDrawing(sh.kind);
    }),
    render: (ids) => <ShapeStyleControls board={b} ids={ids} />,
  };
}

/**
 * One colour for a MIXED selection (shapes, strokes and text together): shown only when the toolbar
 * folds the per-type controls, and only when every selected object takes a stroke colour.
 */
export function sharedColorSection<T extends BoardTileBase>(board: BoardStore<T>): SelectionToolbarSection {
  const b = board as unknown as AnyBoard;
  const strokeShapes = (ids: readonly string[]) => ids.map((id) => b.getShape(id)).filter((s): s is BoardShape => !!s && s.kind !== "sticky");
  return {
    key: "shared-color",
    mixedOnly: true,
    applies: (ids) => ids.length > 0 && strokeShapes(ids).length === ids.length,
    render: (ids) => <SharedColor board={b} ids={ids} />,
  };
}

function SharedColor({ board, ids }: { board: AnyBoard; ids: readonly string[] }) {
  const all = useSyncExternalStore(board.subscribeShapes, board.getShapes, board.getShapes);
  const picked = all.filter((s) => ids.includes(s.id));
  if (picked.length === 0) return null;
  const stroke = common(picked, "stroke");
  return (
    <SelectionToolbarMenu
      label="Color"
      trigger={
        <span
          aria-hidden
          className="h-4 w-4 rounded-full border border-border"
          style={{ background: stroke ? shapeColorCss(stroke) : "conic-gradient(hsl(var(--board-accent-rose)), hsl(var(--board-accent-blue)), hsl(var(--board-accent-emerald)), hsl(var(--board-accent-rose)))" }}
        />
      }
    >
      <ColorSwatches value={stroke} onPick={(c) => c !== "none" && board.restyleShapes(picked.map((s) => s.id), { stroke: c })} />
    </SelectionToolbarMenu>
  );
}

function ShapeStyleControls({ board, ids }: { board: AnyBoard; ids: readonly string[] }) {
  const all = useSyncExternalStore(board.subscribeShapes, board.getShapes, board.getShapes);
  const picked = all.filter((s) => ids.includes(s.id) && isDrawing(s.kind));
  if (picked.length === 0) return null;
  const set = (patch: Partial<ShapeStyle>) => board.restyleShapes(picked.map((s) => s.id), patch);
  const stroke = common(picked, "stroke");
  const boxes = picked.filter((s) => isBoxKind(s.kind));
  const fill = boxes.length ? common(boxes, "fill") : null;
  const texts = picked.filter((s) => textCapable(s.kind));
  return (
    <>
      <SelectionToolbarMenu
        label="Color"
        trigger={
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border border-border"
            style={{ background: stroke ? shapeColorCss(stroke) : "conic-gradient(hsl(var(--board-accent-rose)), hsl(var(--board-accent-blue)), hsl(var(--board-accent-emerald)), hsl(var(--board-accent-rose)))" }}
          />
        }
      >
        <ColorSwatches value={stroke} onPick={(c) => c !== "none" && set({ stroke: c })} />
      </SelectionToolbarMenu>
      {boxes.length > 0 && (
        <SelectionToolbarMenu
          label="Fill"
          trigger={
            <span
              aria-hidden
              className="h-4 w-4 rounded-[4px] border border-border"
              style={{ background: fill && fill !== "none" ? shapeColorCss(fill, FILL_ALPHA * 2) : "transparent" }}
            />
          }
        >
          <ColorSwatches value={fill} withNone alpha={FILL_ALPHA * 2} onPick={(c) => set({ fill: c })} />
        </SelectionToolbarMenu>
      )}
      <SelectionToolbarMenu label="Line style" trigger={<SlidersHorizontal className="h-4 w-4" />}>
        <div className="flex flex-col gap-1.5">
          <ChoiceRow
            label="Weight"
            value={common(picked, "size")}
            options={[
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
              { value: "xl", label: "XL" },
            ]}
            onPick={(size) => set({ size })}
          />
          <ChoiceRow
            label="Line"
            value={common(picked, "dash")}
            options={[
              { value: "solid", label: "Solid", icon: <DashIcon dash="solid" /> },
              { value: "dashed", label: "Dashed", icon: <DashIcon dash="dashed" /> },
              { value: "dotted", label: "Dotted", icon: <DashIcon dash="dotted" /> },
            ]}
            onPick={(dash) => set({ dash })}
          />
          <ChoiceRow
            label="Opacity"
            value={(() => {
              const o = common(picked, "opacity");
              return o === null ? null : (String(Math.round(o * 100)) as "100" | "75" | "50" | "25");
            })()}
            options={[
              { value: "100", label: "100%" },
              { value: "75", label: "75%" },
              { value: "50", label: "50%" },
              { value: "25", label: "25%" },
            ]}
            onPick={(v) => set({ opacity: Number(v) / 100 })}
          />
        </div>
      </SelectionToolbarMenu>
      {texts.length > 0 && (
        <SelectionToolbarMenu label="Text" trigger={<Type className="h-4 w-4" />}>
          <div className="flex flex-col gap-1.5">
            <ChoiceRow
              label="Size"
              value={common(texts, "textSize")}
              options={[
                { value: "s", label: "S" },
                { value: "m", label: "M" },
                { value: "l", label: "L" },
                { value: "xl", label: "XL" },
              ]}
              onPick={(textSize) => board.restyleShapes(texts.map((s) => s.id), { textSize })}
            />
            <ChoiceRow
              label="Align"
              value={common(texts, "textAlign")}
              options={[
                { value: "start", label: "Left", icon: <AlignLeft className="h-4 w-4" /> },
                { value: "center", label: "Center", icon: <AlignCenter className="h-4 w-4" /> },
                { value: "end", label: "Right", icon: <AlignRight className="h-4 w-4" /> },
              ]}
              onPick={(textAlign) => board.restyleShapes(texts.map((s) => s.id), { textAlign })}
            />
          </div>
        </SelectionToolbarMenu>
      )}
    </>
  );
}

function DashIcon({ dash }: { dash: ShapeStyle["dash"] }) {
  return (
    <svg aria-hidden viewBox="0 0 20 4" className="h-1 w-5 overflow-visible">
      <line
        x1={1}
        y1={2}
        x2={19}
        y2={2}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dash === "dashed" ? "5 4" : dash === "dotted" ? "0 4" : undefined}
      />
    </svg>
  );
}

/**
 * Layer order, duplicate and delete for whatever is selected: drawings, sticky notes and text, and
 * TILES (actions only — a tile has no style section). Order applies within a kind (tiles among tiles,
 * shapes among shapes; shapes always draw above tiles).
 */
export function selectionActionsSection<T extends BoardTileBase>({
  board,
  duplicate,
  remove,
}: {
  board: BoardStore<T>;
  duplicate: () => boolean;
  remove: () => void;
}): SelectionToolbarSection {
  const b = board as unknown as AnyBoard;
  return {
    key: "selection-actions",
    applies: (ids) => ids.length > 0,
    render: (ids) => {
      const shapes = ids.filter((id) => b.getShape(id));
      const tiles = ids.filter((id) => b.getTile(id));
      const order = (dir: "front" | "back") => {
        if (shapes.length) b.reorderShapes(shapes, dir);
        if (tiles.length) b.reorderTiles(tiles, dir);
      };
      return (
        <>
          {shapes.length + tiles.length > 0 && (
            <>
              <SelectionToolbarButton label="Bring to front" shortcut="⌥⌘]" icon={BringToFront} onClick={() => order("front")} />
              <SelectionToolbarButton label="Send to back" shortcut="⌥⌘[" icon={SendToBack} onClick={() => order("back")} />
              <SelectionToolbarButton label="Duplicate" shortcut="⌘D" icon={Copy} onClick={() => duplicate()} />
            </>
          )}
          <SelectionToolbarButton label="Delete" shortcut="⌫" icon={Trash2} onClick={remove} />
        </>
      );
    },
  };
}
