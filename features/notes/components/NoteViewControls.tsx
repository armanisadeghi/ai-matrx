"use client";

// NoteViewControls — header chrome unit for a notes instance.
// The mode capsule + the note tools. Takes ONLY instanceId; reads the
// active note + its editor mode + the instance's history state from Redux.
// Renders nothing when no note is active. ZERO PROP DRILLING — drops into any
// WindowPanel `actionsRight` slot or a page header alike.

import { Type, SplitSquareHorizontal, PenLine, Eye } from "lucide-react";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceActiveTab } from "../redux/selectors";
import { cn } from "@/lib/utils";
import { NoteModeSwitch } from "./NoteModeSwitch";
import { NoteRecordTools } from "./NoteRecordTools";

/**
 * The note modes, in plain words, in the order a person meets them (Arman,
 * 2026-10-07: Write first, and the default everywhere). ONE list — the page
 * header, this menu and the phone read it.
 *   Write  the one editor, formatted (the default)
 *   Split  the quick plain text on the left, the formatted note live on the right
 *   Plain  that text alone — nothing is ever formatted for you
 *   Read   read-only, rendered
 * The phone has Write (its default) and Plain — `NOTE_PHONE_VIEW_MODES`.
 */
export const NOTE_VIEW_MODES = [
  { mode: "write", label: "Write", hint: "Edit the formatted note", icon: PenLine },
  { mode: "split", label: "Split", hint: "Plain text on the left, the formatted note live on the right", icon: SplitSquareHorizontal },
  { mode: "plain", label: "Plain", hint: "Quick, unformatted text — nothing is ever formatted for you", icon: Type },
  { mode: "preview", label: "Read", hint: "Read the formatted note", icon: Eye },
] as const;

export const NOTE_PHONE_VIEW_MODES = NOTE_VIEW_MODES.filter(
  (m): m is Extract<(typeof NOTE_VIEW_MODES)[number], { mode: "plain" | "write" }> =>
    m.mode === "plain" || m.mode === "write",
);

export type NoteViewMode = (typeof NOTE_VIEW_MODES)[number]["mode"];

export interface NoteViewControlsProps {
  instanceId: string;
  className?: string;
}

/**
 * The header unit of a notes instance in a window / drawer: THE four-mode
 * capsule (`NoteModeSwitch`) and THE note tools (`NoteRecordTools`: outline,
 * versions, clean-up) — the same two components /notes and the Board use.
 */
export function NoteViewControls({ instanceId, className }: NoteViewControlsProps) {
  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  if (!activeTabId) return null;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <NoteModeSwitch noteId={activeTabId} labels="container" />
      <TapTargetButtonGroup surface="solid">
        <NoteRecordTools instanceId={instanceId} noteId={activeTabId} />
      </TapTargetButtonGroup>
    </div>
  );
}
