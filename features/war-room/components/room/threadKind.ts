// features/war-room/components/room/threadKind.ts
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
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Mic,
  Paperclip,
  Sparkles,
  Layers,
} from "lucide-react";
import type { ThreadAnchorType, ThreadTab } from "@/features/war-room/types";

export interface ThreadKind {
  id: ThreadTab;
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

export const THREAD_KINDS: Record<ThreadTab, ThreadKind> = {
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

export const THREAD_KIND_ORDER: ThreadTab[] = [
  "task",
  "notes",
  "audio",
  "files",
  "agent",
  "combined",
];

export function threadKindOf(
  tab: ThreadTab | string | null | undefined,
): ThreadKind {
  return THREAD_KINDS[(tab as ThreadTab) ?? "task"] ?? THREAD_KINDS.task;
}

/** Canvas-anchored threads — freeform resource hub (the thread IS the identity). */
const CANVAS_DYNAMIC_KIND: ThreadKind = {
  id: "task",
  label: "Canvas",
  Icon: LayoutGrid,
  text: "text-accent-2",
  bg: "bg-accent-2/10",
  rail: "bg-accent-2",
  sectionBorder: "border-l-accent-2",
};

/** Project-anchored threads — first tab lists the project's tasks. */
const PROJECT_SECTION_KIND: ThreadKind = {
  id: "task",
  label: "Project",
  Icon: FolderKanban,
  text: "text-primary",
  bg: "bg-primary/10",
  rail: "bg-primary",
  sectionBorder: "border-l-primary",
};

/**
 * Label + accent for a tab segment. The first tab (`task`) is the **Dynamic**
 * tab: `project` → Project, `task` → Task, `canvas` → Canvas.
 */
export function dynamicTabKind(
  tab: ThreadTab | string | null | undefined,
  anchorType: ThreadAnchorType = "canvas",
): ThreadKind {
  if (tab === "task") {
    if (anchorType === "project") return PROJECT_SECTION_KIND;
    if (anchorType === "task") return THREAD_KINDS.task;
    return CANVAS_DYNAMIC_KIND;
  }
  return threadKindOf(tab);
}

export function combinedSectionKind(
  tab: "task" | "notes" | "audio" | "files",
  anchorType: ThreadAnchorType = "canvas",
): ThreadKind {
  if (tab === "task") return dynamicTabKind("task", anchorType);
  return threadKindOf(tab);
}

// Re-export for consumers that only need the project section kind.
export { PROJECT_SECTION_KIND };
