// features/war-room/components/room/tileKind.ts
//
// Maps a tile's active tab to a glanceable identity: a semantic accent color +
// Lucide icon + short label. The accent gives the busy multitasker an
// at-a-glance read of "what kind of thread is this" without reading the title —
// the spine of the tile accent-rail. Colors are all semantic tokens, never raw
// hex, so dark mode and theme changes flow through automatically.
//
// Mapping: task → success (green), notes → warning (yellow), audio → secondary
// (purple), files → info (light blue), project task section → primary (dark blue),
// agent → secondary, all → neutral in combined stack. Used by the tile accent
// rail, the segmented tab switcher's active pip, the combined-view section
// rails, and the room-header instrument projector.

import {
  FolderKanban,
  ListChecks,
  NotebookPen,
  Mic,
  Paperclip,
  Sparkles,
  Layers,
} from "lucide-react";
import type { TileFlavor, TileTab } from "@/features/war-room/types";

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
  /** Combined "All" view — left spine on the section content box. */
  sectionBorder: string;
}

export const TILE_KINDS: Record<TileTab, TileKind> = {
  task: {
    id: "task",
    label: "Task",
    Icon: ListChecks,
    text: "text-success",
    bg: "bg-success/10",
    rail: "bg-success",
    sectionBorder: "border-l-success",
  },
  notes: {
    id: "notes",
    label: "Notes",
    Icon: NotebookPen,
    text: "text-warning",
    bg: "bg-warning/10",
    rail: "bg-warning",
    sectionBorder: "border-l-warning",
  },
  audio: {
    id: "audio",
    label: "Audio",
    Icon: Mic,
    text: "text-secondary",
    bg: "bg-secondary/10",
    rail: "bg-secondary",
    sectionBorder: "border-l-secondary",
  },
  files: {
    id: "files",
    label: "Files",
    Icon: Paperclip,
    text: "text-info",
    bg: "bg-info/10",
    rail: "bg-info",
    sectionBorder: "border-l-info",
  },
  agent: {
    id: "agent",
    label: "Agent",
    Icon: Sparkles,
    // Secondary accent — used by no other thread kind here, and it matches the
    // Scribe Agent+ send affordance, so the agent thread reads as its own thing.
    text: "text-secondary",
    bg: "bg-secondary/10",
    rail: "bg-secondary",
    sectionBorder: "border-l-secondary",
  },
  combined: {
    id: "combined",
    label: "All",
    Icon: Layers,
    text: "text-success",
    bg: "bg-success/10",
    rail: "bg-success",
    sectionBorder: "border-l-success",
  },
};

export const TILE_KIND_ORDER: TileTab[] = [
  "task",
  "notes",
  "audio",
  "files",
  "agent",
  "combined",
];

export function tileKindOf(tab: TileTab | string | null | undefined): TileKind {
  return TILE_KINDS[(tab as TileTab) ?? "task"] ?? TILE_KINDS.task;
}

/** Tab switcher + accent rail: project-flavor tiles label the first tab "Project". */
export function tileTabKind(
  tab: TileTab | string | null | undefined,
  flavor?: TileFlavor,
): TileKind {
  if (tab === "task" && flavor === "project") return PROJECT_SECTION_KIND;
  return tileKindOf(tab);
}

/** Project-flavored tiles paint the stacked Task section dark blue; otherwise task green. */
const PROJECT_SECTION_KIND: TileKind = {
  id: "task",
  label: "Project",
  Icon: FolderKanban,
  text: "text-primary",
  bg: "bg-primary/10",
  rail: "bg-primary",
  sectionBorder: "border-l-primary",
};

export function combinedSectionKind(
  tab: "task" | "notes" | "audio" | "files",
  flavor?: TileFlavor,
): TileKind {
  if (tab === "task" && flavor === "project") return PROJECT_SECTION_KIND;
  return tileKindOf(tab);
}

// Re-export for consumers that only need the project section kind.
export { PROJECT_SECTION_KIND };
