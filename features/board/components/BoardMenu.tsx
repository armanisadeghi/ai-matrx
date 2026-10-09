"use client";

/**
 * BoardMenu — the platform's ONE right-click menu (context-menu-v3),
 * wired for the board: one menu for the whole plane, resolving the tile that
 * was right-clicked at open (THE ONE-MENU-PER-PANE rule). The clicked tile's
 * actions come first (a `primary` section); board actions follow; Copy,
 * Export, Download as Markdown and the AI actions come from the menu itself,
 * fed the tile's text.
 */

import { type ReactNode, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArchiveRestore,
  BringToFront,
  Copy,
  SendToBack,
  Columns3,
  Frame,
  Grid3x3,
  LayoutGrid,
  Rows3,
  Shapes,
  Crosshair,
  Maximize,
  Maximize2,
  MousePointer2,
  PanelRightOpen,
  Save,
  ScanSearch,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_HEADING_KEY, type ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { screenToWorld, zoomAt } from "../engine/camera";
import type { BoardCameraStore } from "../engine/camera-store";
import { WHEEL_MODE_LABEL, type WheelMode } from "../engine/wheel-input";
import type { ArrangeCommand } from "../engine/arrange";
import { ARRANGE_SHORTCUT } from "../board/arrange-board";

/** What the host can do to a tile. An action the host leaves out is not
 * shown (a War Room thread is already saved, so it has no "save & close"). */
export interface TileMenuActions {
  park?: (id: string) => void;
  saveAndClose?: (id: string) => void;
  remove?: (id: string) => void;
  /** The same two for a selection of several tiles (one undo step); without them each tile is done in turn. */
  parkMany?: (ids: string[]) => void;
  removeMany?: (ids: string[]) => void;
  /** Label for `remove` — say what is actually deleted. Default "Delete from board…". */
  removeLabel?: string;
}

/** What the host can do to a frame. */
export interface FrameMenuActions {
  /** Delete the frame only; its tiles stay. */
  remove?: (id: string) => void;
  /** Delete the frame and every tile inside it. */
  removeWithContents?: (id: string) => void;
}

function optionalItems(id: string, actions: TileMenuActions): ContextMenuExtraSection["items"] {
  const items: ContextMenuExtraSection["items"] = [];
  const { park, saveAndClose, remove, removeLabel = "Delete from board…" } = actions;
  if (park) items.push({ kind: "item", id: "park", label: "Park", icon: PanelRightOpen, hint: "→", onSelect: () => park(id) });
  if (saveAndClose)
    items.push({ kind: "item", id: "save", label: "Save to notes & close", icon: Save, hint: "↑", onSelect: () => saveAndClose(id) });
  if (remove)
    items.push({ kind: "item", id: "delete", label: removeLabel, icon: Trash2, hint: "↓", destructive: true, onSelect: () => remove(id) });
  return items;
}

export function BoardMenu({
  store,
  actions,
  parked,
  onUnpark,
  wheelMode,
  onWheelMode,
  onArrange,
  frameActions,
  tilesOf,
  describeSelection,
  objectActions,
  boardTitle,
  children,
}: {
  /** The selection in plain words ("12 stickies"): the menu's header names the selection, never page text. */
  describeSelection?: (ids: string[]) => string;
  /** Actions on selected canvas objects (stickies, text, shapes, strokes), for a right-click on one. */
  objectActions?: { duplicate: () => void; front: () => void; back: () => void; remove: () => void };
  boardTitle?: string;
  store: BoardCameraStore | null;
  actions: TileMenuActions;
  /** A frame's own actions (right-click on its title strip or border). */
  frameActions?: FrameMenuActions;
  /** Which of these selected ids are tiles (a selection can hold frames too). Default: all of them. */
  tilesOf?: (ids: string[]) => string[];
  parked: { id: string; title: string }[];
  onUnpark: (id: string) => void;
  wheelMode: WheelMode;
  onWheelMode: (mode: WheelMode) => void;
  /** Arrange the board (frames move with their tiles). Omit on a board whose layout the host owns. */
  onArrange?: (command: ArrangeCommand) => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<{ id: string; title: string; frame: boolean; object?: boolean } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Where the right-click landed: the menu opens from the DOM element, but drawings are hit-tested in JS.
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  // How many are selected when the menu opens: Arrange acts on 2+ selected, else the board.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedCount = selectedIds.length;

  const sections: ContextMenuExtraSection[] = [];
  if (target?.frame) {
    const items: ContextMenuExtraSection["items"] = [
      { kind: "item", id: "frame-fly", label: "Fly to", icon: Crosshair, onSelect: () => store?.fitItem(`frame:${target.id}`) },
    ];
    if (frameActions?.remove) {
      const remove = frameActions.remove;
      items.push({ kind: "item", id: "frame-delete", label: "Delete frame", icon: Trash2, onSelect: () => remove(target.id) });
    }
    if (frameActions?.removeWithContents) {
      const removeAll = frameActions.removeWithContents;
      items.push({
        kind: "item",
        id: "frame-delete-all",
        label: "Delete with contents",
        icon: Trash2,
        destructive: true,
        onSelect: () => removeAll(target.id),
      });
    }
    sections.push({ id: "board-frame", label: target.title, icon: Frame, primary: true, anchor: "after-clipboard", items });
  } else if (target && selectedIds.length > 1 && selectedIds.includes(target.id) && (tilesOf ? tilesOf(selectedIds) : selectedIds).length > 1) {
    // Right-click inside a multi-selection acts on the selection (Figma, tldraw).
    const ids = tilesOf ? tilesOf(selectedIds) : selectedIds;
    const n = ids.length;
    const items: ContextMenuExtraSection["items"] = [];
    const { park, parkMany, remove, removeMany, removeLabel } = actions;
    if (parkMany || park)
      items.push({
        kind: "item",
        id: "park-selection",
        label: `Park ${n} tiles`,
        icon: PanelRightOpen,
        onSelect: () => (parkMany ? parkMany(ids) : ids.forEach((id) => park?.(id))),
      });
    if (removeMany || remove)
      items.push({
        kind: "item",
        id: "delete-selection",
        label: `${removeLabel?.startsWith("Take off") ? "Take off" : "Delete from board"} ${n} tiles`,
        icon: Trash2,
        destructive: true,
        onSelect: () => (removeMany ? removeMany(ids) : ids.forEach((id) => remove?.(id))),
      });
    sections.push({ id: "board-selection", label: `${n} tiles selected`, primary: true, anchor: "after-clipboard", items });
  } else if (target?.object && objectActions) {
    const n = selectedIds.length;
    const label = (describeSelection?.(selectedIds) || target.title) + " selected";
    sections.push({
      id: "board-objects",
      label,
      primary: true,
      anchor: "after-clipboard",
      items: [
        { kind: "item", id: "obj-front", label: "Bring to front", icon: BringToFront, hint: "⌥⌘]", onSelect: objectActions.front },
        { kind: "item", id: "obj-back", label: "Send to back", icon: SendToBack, hint: "⌥⌘[", onSelect: objectActions.back },
        { kind: "item", id: "obj-duplicate", label: n > 1 ? `Duplicate ${n}` : "Duplicate", icon: Copy, hint: "⌘D", onSelect: objectActions.duplicate },
        { kind: "item", id: "obj-delete", label: n > 1 ? `Delete ${n}` : "Delete", icon: Trash2, hint: "⌫", destructive: true, onSelect: objectActions.remove },
      ],
    });
  } else if (target) {
    sections.push({
      id: "board-tile",
      label: target.title,
      primary: true,
      anchor: "after-clipboard",
      items: [
        { kind: "item", id: "focus", label: "Focus", icon: Maximize2, hint: "Enter", onSelect: () => store?.focus(target.id) },
        { kind: "item", id: "fly", label: "Fly to", icon: Crosshair, onSelect: () => store?.fitItem(target.id) },
        ...optionalItems(target.id, actions),
      ],
    });
  }
  const zoomTo = (z: number) => {
    if (!store) return;
    const { w, h } = store.getSize();
    store.flyTo(zoomAt(store.getCamera(), w / 2, h / 2, z), 220);
  };
  sections.push({
    id: "board",
    label: "Board",
    icon: ScanSearch,
    anchor: "after-placements",
    items: [
      { kind: "item", id: "fit", label: "Fit everything", icon: Maximize, hint: "⇧1", onSelect: () => store?.fitAll() },
      { kind: "item", id: "zoom-100", label: "Zoom to 100%", icon: ScanSearch, hint: "⇧0", onSelect: () => zoomTo(1) },
      ...(onArrange ? [arrangeMenu(onArrange, selectedCount)] : []),
      {
        kind: "submenu",
        id: "wheel",
        label: "Scrolling",
        icon: MousePointer2,
        children: (Object.keys(WHEEL_MODE_LABEL) as WheelMode[]).map((mode) => ({
          kind: "checkbox" as const,
          id: `wheel-${mode}`,
          label: WHEEL_MODE_LABEL[mode],
          checked: wheelMode === mode,
          onCheckedChange: () => onWheelMode(mode),
        })),
      },
      {
        kind: "submenu",
        id: "parked",
        label: parked.length ? `Parked (${parked.length})` : "Parked",
        icon: ArchiveRestore,
        disabled: parked.length === 0,
        children: parked.map((p) => ({
          kind: "item" as const,
          id: `unpark-${p.id}`,
          label: p.title,
          onSelect: () => onUnpark(p.id),
        })),
      },
    ],
  });

  return (
    <NonEditableContextMenu
      sourceFeature="ai-results"
      extraSections={sections}
      resolveContextOnOpen={(el) => {
        const frame = el?.closest<HTMLElement>("[data-board-frame-strip], [data-board-frame-border]")?.closest<HTMLElement>("[data-board-frame]");
        const tile = el?.closest<HTMLElement>("[data-board-card], [data-board-tile]");
        // The header names the SELECTION, never the page text around the pointer.
        const heading = (fallbackLabel: string, fallbackText: string) => {
          const ids = [...(store?.getSelection() ?? [])];
          const said = ids.length > 1 ? describeSelection?.(ids) : "";
          return { label: said ? "Selection" : fallbackLabel, text: said || fallbackText };
        };
        // Right-click selects what is under the pointer; inside the selection it keeps the selection (Figma).
        const pick = (id: string) => {
          if (!store?.isSelected(id)) store?.select(id);
          setSelectedIds([...(store?.getSelection() ?? [])]);
        };
        // A drawing, sticky or text under the pointer wins over a tile below it (it paints above).
        const at = pressAt.current;
        const host = store?.getShapeHost();
        const bounds = hostRef.current?.getBoundingClientRect();
        if (store && host && at && bounds) {
          const cam = store.getCamera();
          const hit = host.hit(screenToWorld(cam, at.x - bounds.left, at.y - bounds.top), 6 / cam.z, { background: !tile });
          if (hit) {
            pick(hit);
            const ids = [...store.getSelection()];
            const said = describeSelection?.(ids) || "Object";
            setTarget({ id: hit, title: said, frame: false, object: true });
            return { content: "", title: said, [CONTEXT_MENU_HEADING_KEY]: { label: "Selection", text: said } };
          }
        }
        if (frame?.dataset.boardFrame) {
          const id = frame.dataset.boardFrame;
          setTarget({ id, title: frame.dataset.boardTitle ?? "Frame", frame: true });
          pick(id);
          return { content: "", title: frame.dataset.boardTitle ?? "Frame", [CONTEXT_MENU_HEADING_KEY]: heading("Frame", frame.dataset.boardTitle ?? "Frame") };
        }
        const id = tile?.dataset.boardCard ?? tile?.dataset.boardTile ?? null;
        if (!tile || !id) {
          setTarget(null);
          const ids = [...(store?.getSelection() ?? [])];
          setSelectedIds(ids);
          const said = ids.length ? describeSelection?.(ids) : "";
          return {
            content: "",
            title: said || boardTitle || "Board",
            [CONTEXT_MENU_HEADING_KEY]: said ? { label: "Selection", text: said } : { label: "Board", text: boardTitle || "Untitled board" },
          };
        }
        const title = tile.dataset.boardTitle ?? "Tile";
        setTarget({ id, title, frame: false });
        pick(id);
        const body = tile.querySelector<HTMLElement>("[data-board-body]");
        return { content: body?.innerText ?? "", title, [CONTEXT_MENU_HEADING_KEY]: heading("Tile", title) };
      }}
    >
      <div
        ref={hostRef}
        className="h-full min-h-0"
        onContextMenuCapture={(e) => {
          pressAt.current = { x: e.clientX, y: e.clientY };
        }}
      >
        {children}
      </div>
    </NonEditableContextMenu>
  );
}

/** Board → Arrange: the arrange engine's commands, with their shortcuts. */
function arrangeMenu(run: (command: ArrangeCommand) => void, selectedCount: number): ContextMenuExtraSection["items"][number] {
  const item = (
    id: string,
    label: string,
    icon: LucideIcon,
    command: ArrangeCommand,
    hint?: string,
  ) => ({ kind: "item" as const, id: `arrange-${id}`, label, icon, hint, onSelect: () => run(command) });
  return {
    kind: "submenu",
    id: "arrange",
    // Says what it acts on: 2+ selected → the selection, otherwise the whole board.
    label: selectedCount > 1 ? `Arrange selection (${selectedCount})` : "Arrange board",
    icon: LayoutGrid,
    children: [
      item("tidy", "Tidy up", LayoutGrid, { kind: "layout", layout: "tidy" }, ARRANGE_SHORTCUT.tidy),
      item("by-type", "By type", Shapes, { kind: "by-type" }, ARRANGE_SHORTCUT.byType),
      item("frames-by-type", "Into frames by type", Frame, { kind: "frames-by-type" }),
      { kind: "separator", id: "arrange-sep-1" },
      item("grid", "Grid", Grid3x3, { kind: "layout", layout: "grid" }),
      item("row", "One row", Columns3, { kind: "layout", layout: "row" }),
      item("column", "One column", Rows3, { kind: "layout", layout: "column" }),
      { kind: "separator", id: "arrange-sep-2" },
      {
        kind: "submenu",
        id: "arrange-align",
        label: "Align",
        icon: AlignStartVertical,
        children: [
          item("align-left", "Left", AlignStartVertical, { kind: "align", edge: "left" }, ARRANGE_SHORTCUT.alignLeft),
          item("align-center", "Center", AlignCenterVertical, { kind: "align", edge: "center" }, ARRANGE_SHORTCUT.alignCenter),
          item("align-right", "Right", AlignEndVertical, { kind: "align", edge: "right" }, ARRANGE_SHORTCUT.alignRight),
          item("align-top", "Top", AlignStartHorizontal, { kind: "align", edge: "top" }, ARRANGE_SHORTCUT.alignTop),
          item("align-middle", "Middle", AlignCenterHorizontal, { kind: "align", edge: "middle" }, ARRANGE_SHORTCUT.alignMiddle),
          item("align-bottom", "Bottom", AlignEndHorizontal, { kind: "align", edge: "bottom" }, ARRANGE_SHORTCUT.alignBottom),
        ],
      },
      {
        kind: "submenu",
        id: "arrange-distribute",
        label: "Distribute",
        icon: AlignHorizontalDistributeCenter,
        children: [
          item("distribute-h", "Horizontally", AlignHorizontalDistributeCenter, { kind: "distribute", axis: "horizontal" }, ARRANGE_SHORTCUT.distributeH),
          item("distribute-v", "Vertically", AlignVerticalDistributeCenter, { kind: "distribute", axis: "vertical" }, ARRANGE_SHORTCUT.distributeV),
        ],
      },
    ],
  };
}
