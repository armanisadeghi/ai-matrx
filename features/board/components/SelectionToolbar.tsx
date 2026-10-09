"use client";

/**
 * SelectionToolbar — THE floating context toolbar over the board's current
 * selection (FigJam / Miro / tldraw). One per board, screen-space chrome in
 * the viewport's overlay: it sits centred just above the selection's bounds
 * (below them when there is no room above), follows a pan, zoom or move by
 * writing its own style (no React render per frame), and steps out of the way
 * while a press is down, the camera moves, a tile is being worked in, a tile is
 * full screen or a creation tool is active. Never a fixed row.
 *
 * It is a PRIMITIVE: the toolbar knows nothing about what is selected. A host
 * passes SECTIONS; each says whether it applies to the selection and renders
 * its own controls from the building blocks below. Sections are shown in the
 * order given, separated by a divider. Later lanes (sticky notes, text,
 * frames) add a section — they never build a second toolbar.
 *
 *   <SelectionToolbar sections={[shapeStyleSection(board), arrangeSection, actionsSection]} />
 *
 *   const mySection: SelectionToolbarSection = {
 *     key: "frame-title",
 *     applies: (ids) => ids.every(isFrameId),
 *     render: (ids) => <SelectionToolbarButton label="Rename" icon={Pencil} onClick={…} />,
 *   };
 *
 * Building blocks: `SelectionToolbarButton` (an icon button with a tooltip
 * label + shortcut), `SelectionToolbarMenu` (a button opening a popover of
 * choices), `SelectionToolbarDivider`, `ColorSwatches` (the board's semantic
 * palette, light + dark), `ChoiceRow` (a row of labelled options).
 */

import { type ReactNode, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { worldToScreen, type Rect } from "../engine/camera";
import { useActiveTool, useBoardCameraStore, useEditingTile, useFocusedTile, useSelection } from "../engine/react";
import { boundsOf, frameBody, frameKey } from "../engine/selection";
import { SHAPE_COLORS, type ShapeColor, shapeColorCss } from "../engine/shapes";

export interface SelectionToolbarSection {
  /** Stable React key. */
  key: string;
  /** Show this section for this selection (ids of tiles, frames and shapes). */
  applies: (selection: readonly string[]) => boolean;
  render: (selection: readonly string[]) => ReactNode;
}

/** Screen px between the selection and the toolbar. */
const GAP_PX = 12;
/** Screen px the toolbar keeps from the board's edges. */
const EDGE_PX = 8;

export function SelectionToolbar({ sections }: { sections: readonly SelectionToolbarSection[] }) {
  const store = useBoardCameraStore();
  const selection = useSelection();
  const tool = useActiveTool();
  const editing = useEditingTile();
  const focused = useFocusedTile();
  const ref = useRef<HTMLDivElement>(null);
  const shown = sections.filter((s) => selection.length > 0 && s.applies(selection));
  // A tile being worked in owns the screen; a shape being typed in keeps its toolbar.
  const quiet = tool !== "select" || focused !== null || (editing !== null && !store.isMark(editing));
  const active = shown.length > 0 && !quiet;

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const root = el.closest<HTMLElement>("[data-board-root]");
    let pressing = false;
    const place = () => {
      const items = store.getItems();
      const rects: Rect[] = [];
      for (const id of store.getSelection()) {
        const own = items.get(id);
        if (own) rects.push(own);
        else {
          const frame = items.get(frameKey(id));
          if (frame) rects.push(frameBody(frame));
        }
      }
      const box = boundsOf(rects);
      if (!box || pressing || store.isInteracting()) {
        el.style.visibility = "hidden";
        return;
      }
      const cam = store.getCamera();
      const size = store.getSize();
      const insets = store.getInsets();
      const tl = worldToScreen(cam, box.x, box.y);
      const br = worldToScreen(cam, box.x + box.w, box.y + box.h);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let top = tl.y - GAP_PX - h;
      if (top < insets.top + EDGE_PX) top = Math.min(br.y + GAP_PX, size.h - insets.bottom - EDGE_PX - h);
      const left = Math.max(EDGE_PX, Math.min(size.w - w - EDGE_PX, (tl.x + br.x) / 2 - w / 2));
      el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(Math.max(EDGE_PX, top))}px, 0)`;
      el.style.visibility = "visible";
    };
    // A press anywhere on the board but the toolbar hides it until the release (a drag, a resize).
    const down = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node) || el.contains(e.target as Node)) return;
      pressing = true;
      place();
    };
    const up = () => {
      if (!pressing) return;
      pressing = false;
      requestAnimationFrame(place);
    };
    place();
    const offFrame = store.subscribeFrame(place);
    const offItems = store.subscribeItems(place);
    const offSel = store.subscribeSelection(place);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      offFrame();
      offItems();
      offSel();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [store, active]);

  if (!active) return null;
  return (
    <div
      ref={ref}
      data-board-chrome
      data-board-selection-toolbar
      role="toolbar"
      aria-label="Selection"
      className="absolute left-0 top-0 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur"
      style={{ visibility: "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {shown.map((s, i) => (
        <div key={s.key} className="flex items-center gap-0.5">
          {i > 0 && <SelectionToolbarDivider />}
          {s.render(selection)}
        </div>
      ))}
    </div>
  );
}

export function SelectionToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}

const buttonClass = (active?: boolean) =>
  cn(
    "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
    active && "bg-primary/15 text-primary-ink hover:bg-primary/20 hover:text-primary-ink",
  );

/** One icon button. `label` is its tooltip and accessible name; `shortcut` is appended. */
export function SelectionToolbarButton({
  label,
  shortcut,
  icon: Icon,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  active?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} onClick={onClick} className={buttonClass(active)}>
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** A button that opens a small popover of choices (colour, weight, size). */
export function SelectionToolbarMenu({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={label} aria-label={label} className={buttonClass()}>
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent data-board-chrome side="top" align="center" sideOffset={8} className="w-auto p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** The board's palette as round swatches; `withNone` adds "No fill". */
export function ColorSwatches({
  value,
  onPick,
  withNone,
  alpha = 1,
}: {
  value: ShapeColor | "none" | null;
  onPick: (color: ShapeColor | "none") => void;
  withNone?: boolean;
  /** Draw the swatch as the fill tint it will paint. */
  alpha?: number;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {withNone && (
        <button
          type="button"
          title="No fill"
          aria-label="No fill"
          aria-pressed={value === "none"}
          onClick={() => onPick("none")}
          className={cn(
            "relative h-7 w-7 overflow-hidden rounded-full border border-border bg-card",
            value === "none" && "ring-2 ring-primary ring-offset-1 ring-offset-card",
          )}
        >
          <span aria-hidden className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-destructive" />
        </button>
      )}
      {SHAPE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={COLOR_LABEL[c]}
          aria-label={COLOR_LABEL[c]}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          className={cn("h-7 w-7 rounded-full border border-border", value === c && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
          style={{ background: alpha === 1 ? shapeColorCss(c) : `linear-gradient(${shapeColorCss(c, alpha)}, ${shapeColorCss(c, alpha)}), hsl(var(--card))` }}
        />
      ))}
    </div>
  );
}

export const COLOR_LABEL: Record<ShapeColor, string> = {
  ink: "Ink",
  slate: "Slate",
  blue: "Blue",
  violet: "Violet",
  rose: "Rose",
  orange: "Orange",
  amber: "Amber",
  emerald: "Green",
  teal: "Teal",
};

/** A labelled row of options (stroke weight, dash, text size). */
export function ChoiceRow<V extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: V | null;
  options: readonly { value: V; label: string; icon?: ReactNode }[];
  onPick: (value: V) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={buttonClass(value === o.value)}
          >
            {o.icon ?? <span className="text-xs font-medium">{o.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
