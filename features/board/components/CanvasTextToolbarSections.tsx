"use client";

/**
 * The floating toolbar's sections for words on the canvas (`SelectionToolbar`):
 *  - sticky notes: the six sticky colours, right on the bar (FigJam), and
 *    alignment;
 *  - plain text: size (S / M / L / XL), bold, colour and alignment (tldraw).
 * Each change is ONE undo step across everything selected
 * (`BoardStore.restyleShapes`).
 */

import { useSyncExternalStore } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold } from "lucide-react";
import type { BoardStore, BoardTileBase } from "../board/board-store";
import { type BoardShape, type ShapeStyle, type StickyColor, STICKY_COLORS, shapeColorCss, styleOf } from "../engine/shapes";
import { cn } from "@/lib/utils";
import {
  ChoiceRow,
  ColorSwatches,
  type SelectionToolbarSection,
  SelectionToolbarButton,
  SelectionToolbarDivider,
  SelectionToolbarMenu,
} from "./SelectionToolbar";
import { stickyColorCss } from "./CanvasTextViews";

type AnyBoard = BoardStore<BoardTileBase>;

const STICKY_LABEL: Record<StickyColor, string> = {
  yellow: "Yellow",
  orange: "Orange",
  pink: "Pink",
  violet: "Violet",
  blue: "Blue",
  green: "Green",
};

function common<K extends keyof ShapeStyle>(shapes: readonly BoardShape[], key: K): ShapeStyle[K] | null {
  const first = styleOf(shapes[0])[key];
  return shapes.every((s) => styleOf(s)[key] === first) ? first : null;
}

function usePicked(board: AnyBoard, ids: readonly string[], kind: BoardShape["kind"]): BoardShape[] {
  const all = useSyncExternalStore(board.subscribeShapes, board.getShapes, board.getShapes);
  return all.filter((s) => s.kind === kind && ids.includes(s.id));
}

const ALIGN_OPTIONS = [
  { value: "start", label: "Left", icon: <AlignLeft className="h-4 w-4" /> },
  { value: "center", label: "Center", icon: <AlignCenter className="h-4 w-4" /> },
  { value: "end", label: "Right", icon: <AlignRight className="h-4 w-4" /> },
] as const;

function AlignIcon({ align }: { align: ShapeStyle["textAlign"] | null }) {
  const Icon = align === "start" ? AlignLeft : align === "end" ? AlignRight : AlignCenter;
  return <Icon className="h-4 w-4" />;
}

// ── sticky notes ─────────────────────────────────────────────────────────────

export function stickyStyleSection<T extends BoardTileBase>(board: BoardStore<T>): SelectionToolbarSection {
  const b = board as unknown as AnyBoard;
  return {
    key: "sticky-style",
    scope: "type",
    label: "Sticky notes",
    applies: (ids) => ids.some((id) => b.getShape(id)?.kind === "sticky"),
    render: (ids) => <StickyControls board={b} ids={ids} />,
  };
}

function StickyControls({ board, ids }: { board: AnyBoard; ids: readonly string[] }) {
  const picked = usePicked(board, ids, "sticky");
  if (picked.length === 0) return null;
  const set = (patch: Partial<ShapeStyle>) => board.restyleShapes(picked.map((s) => s.id), patch);
  const color = common(picked, "sticky");
  const align = common(picked, "textAlign");
  return (
    <>
      <div role="group" aria-label="Sticky color" className="flex items-center gap-1 px-1">
        {STICKY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={STICKY_LABEL[c]}
            aria-label={STICKY_LABEL[c]}
            aria-pressed={color === c}
            onClick={() => set({ sticky: c })}
            className={cn("h-6 w-6 rounded-full border border-border", color === c && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
            style={{ background: stickyColorCss(c) }}
          />
        ))}
      </div>
      <SelectionToolbarDivider />
      <SelectionToolbarMenu label="Align" trigger={<AlignIcon align={align} />}>
        <ChoiceRow label="Align" value={align} options={ALIGN_OPTIONS} onPick={(textAlign) => set({ textAlign })} />
      </SelectionToolbarMenu>
    </>
  );
}

// ── plain text ───────────────────────────────────────────────────────────────

export function textStyleSection<T extends BoardTileBase>(board: BoardStore<T>): SelectionToolbarSection {
  const b = board as unknown as AnyBoard;
  return {
    key: "text-style",
    scope: "type",
    label: "Text",
    applies: (ids) => ids.some((id) => b.getShape(id)?.kind === "text"),
    render: (ids) => <TextControls board={b} ids={ids} />,
  };
}

const SIZE_OPTIONS = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
] as const;

function TextControls({ board, ids }: { board: AnyBoard; ids: readonly string[] }) {
  const picked = usePicked(board, ids, "text");
  if (picked.length === 0) return null;
  const set = (patch: Partial<ShapeStyle>) => board.restyleShapes(picked.map((s) => s.id), patch);
  const size = common(picked, "textSize");
  const bold = common(picked, "textWeight") === "bold";
  const color = common(picked, "stroke");
  const align = common(picked, "textAlign");
  return (
    <>
      <div role="group" aria-label="Text size" className="flex items-center gap-0.5">
        {SIZE_OPTIONS.map((o) => (
          <SelectionToolbarButton key={o.value} label={`Size ${o.label}`} active={size === o.value} onClick={() => set({ textSize: o.value })}>
            <span className="text-xs font-medium">{o.label}</span>
          </SelectionToolbarButton>
        ))}
      </div>
      <SelectionToolbarDivider />
      <SelectionToolbarButton label="Bold" icon={Bold} active={bold} onClick={() => set({ textWeight: bold ? "normal" : "bold" })} />
      <SelectionToolbarMenu
        label="Color"
        trigger={
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border border-border"
            style={{ background: color ? shapeColorCss(color) : "conic-gradient(hsl(var(--board-accent-rose)), hsl(var(--board-accent-blue)), hsl(var(--board-accent-emerald)), hsl(var(--board-accent-rose)))" }}
          />
        }
      >
        <ColorSwatches value={color} onPick={(c) => c !== "none" && set({ stroke: c })} />
      </SelectionToolbarMenu>
      <SelectionToolbarMenu label="Align" trigger={<AlignIcon align={align} />}>
        <ChoiceRow label="Align" value={align} options={ALIGN_OPTIONS} onPick={(textAlign) => set({ textAlign })} />
      </SelectionToolbarMenu>
    </>
  );
}
