// features/war-room/components/room/tileKind.ts
//
// Maps a tile's active tab to a glanceable identity: a semantic accent color +
// Lucide icon + short label. The accent gives the busy multitasker an
// at-a-glance read of "what kind of thread is this" without reading the title —
// the spine of the tile accent-rail. Colors are all semantic tokens, never raw
// hex, so dark mode and theme changes flow through automatically.
//
// Mapping: task → primary, notes → info, audio → warning, files → muted/
// secondary, all → success. Used by the tile accent rail, the segmented tab
// switcher's active pip, the combined-view section rails, and the room-header
// instrument projector.

import { ListChecks, NotebookPen, Mic, Paperclip, Layers } from "lucide-react";
import type { TileTab } from "@/features/war-room/types";

export interface TileKind {
  id: TileTab;
  label: string;
  Icon: typeof ListChecks;
  /** Tailwind text-color class for the icon/active state. */
  text: string;
  /** Tailwind bg tint for an active chip/pip. */
  bg: string;
  /** Tailwind bg class for the solid accent rail / section tick. */
  rail: string;
}

export const TILE_KINDS: Record<TileTab, TileKind> = {
  task: {
    id: "task",
    label: "Task",
    Icon: ListChecks,
    text: "text-primary",
    bg: "bg-primary/10",
    rail: "bg-primary",
  },
  notes: {
    id: "notes",
    label: "Notes",
    Icon: NotebookPen,
    text: "text-info",
    bg: "bg-info/10",
    rail: "bg-info",
  },
  audio: {
    id: "audio",
    label: "Audio",
    Icon: Mic,
    text: "text-warning",
    bg: "bg-warning/10",
    rail: "bg-warning",
  },
  files: {
    id: "files",
    label: "Files",
    Icon: Paperclip,
    // Muted/secondary accent — files are the calmest thread kind, and this
    // keeps the spine distinct from success (combined) and the other accents.
    text: "text-muted-foreground",
    bg: "bg-muted",
    rail: "bg-muted-foreground",
  },
  combined: {
    id: "combined",
    label: "All",
    Icon: Layers,
    text: "text-success",
    bg: "bg-success/10",
    rail: "bg-success",
  },
};

export const TILE_KIND_ORDER: TileTab[] = [
  "task",
  "notes",
  "audio",
  "files",
  "combined",
];

export function tileKindOf(tab: TileTab | string | null | undefined): TileKind {
  return TILE_KINDS[(tab as TileTab) ?? "task"] ?? TILE_KINDS.task;
}
