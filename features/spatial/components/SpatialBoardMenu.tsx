"use client";

/**
 * SpatialBoardMenu — the platform's ONE right-click menu (context-menu-v3),
 * wired for the board: one menu for the whole plane, resolving the tile that
 * was right-clicked at open (THE ONE-MENU-PER-PANE rule). The clicked tile's
 * actions come first (a `primary` section); board actions follow; Copy,
 * Export, Download as Markdown and the AI actions come from the menu itself,
 * fed the tile's text.
 */

import { type ReactNode, useState } from "react";
import {
  ArchiveRestore,
  Crosshair,
  Maximize,
  Maximize2,
  MousePointer2,
  PanelRightOpen,
  Save,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { zoomAt } from "../engine/camera";
import type { SpatialStore } from "../engine/spatial-store";
import { WHEEL_MODE_LABEL, type WheelMode } from "../engine/wheel-input";

/** What the host can do to a tile. An action the host leaves out is not
 * shown (a War Room thread is already saved, so it has no "save & close"). */
export interface TileMenuActions {
  park?: (id: string) => void;
  saveAndClose?: (id: string) => void;
  remove?: (id: string) => void;
  /** Label for `remove` — say what is actually deleted. Default "Delete from board…". */
  removeLabel?: string;
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

export function SpatialBoardMenu({
  store,
  actions,
  parked,
  onUnpark,
  wheelMode,
  onWheelMode,
  children,
}: {
  store: SpatialStore | null;
  actions: TileMenuActions;
  parked: { id: string; title: string }[];
  onUnpark: (id: string) => void;
  wheelMode: WheelMode;
  onWheelMode: (mode: WheelMode) => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);

  const sections: ContextMenuExtraSection[] = [];
  if (target) {
    sections.push({
      id: "spatial-tile",
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
    id: "spatial-board",
    label: "Board",
    icon: ScanSearch,
    anchor: "after-placements",
    items: [
      { kind: "item", id: "fit", label: "Fit everything", icon: Maximize, hint: "⇧1", onSelect: () => store?.fitAll() },
      { kind: "item", id: "zoom-100", label: "Zoom to 100%", icon: ScanSearch, hint: "⇧0", onSelect: () => zoomTo(1) },
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
        const tile = el?.closest<HTMLElement>("[data-spatial-card], [data-spatial-tile]");
        const id = tile?.dataset.spatialCard ?? tile?.dataset.spatialTile ?? null;
        if (!tile || !id) {
          setTarget(null);
          return null;
        }
        const title = tile.dataset.spatialTitle ?? "Tile";
        setTarget({ id, title });
        store?.select(id);
        const body = tile.querySelector<HTMLElement>("[data-spatial-body]");
        return { content: body?.innerText ?? "", title };
      }}
    >
      <div className="h-full min-h-0">{children}</div>
    </NonEditableContextMenu>
  );
}
