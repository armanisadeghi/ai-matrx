"use client";

/**
 * ArtifactResultBar — the persistent, full-width bar a completed artifact tool
 * leaves behind in chat.
 *
 * Most tools fold to a dim single line when done. A tool that PRODUCES something
 * the user keeps working with leaves this instead: a professional bar that names
 * the artifact, says what just happened, and — on click — opens the final version
 * (the working document in a resizable right sidebar; a note in the notes window).
 * A trailing chevron peeks the inline body. Kind-based: add a kind in
 * `registry/toolArtifact.ts` + a row in `KIND_META` and it works everywhere.
 */

import {
  ChevronDown,
  ChevronRight,
  FileText,
  StickyNote,
  PanelRightOpen,
  type LucideIcon,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocTitle } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { cn } from "@/lib/utils";
import type { ToolArtifact, ToolArtifactKind } from "../registry/toolArtifact";

interface ArtifactResultBarProps {
  artifact: ToolArtifact;
  /** Present for the working document (its open handle); absent for id-based kinds. */
  conversationId?: string;
  /** Whether the inline body peek is currently open (drives the chevron). */
  peekExpanded: boolean;
  /** Toggle the inline body peek. */
  onTogglePeek: () => void;
}

interface KindMeta {
  Icon: LucideIcon;
  /** Lowercase noun for the sub-label: "Working document" / "Note". */
  noun: string;
  /** Icon-chip tint classes. */
  chip: string;
  /** Hover accent on the bar border + the Open affordance. */
  hoverBorder: string;
  openHover: string;
}

const KIND_META: Record<ToolArtifactKind, KindMeta> = {
  working_document: {
    Icon: FileText,
    noun: "Working document",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    hoverBorder: "hover:border-sky-500/40",
    openHover:
      "group-hover/bar:bg-sky-500/10 group-hover/bar:text-sky-600 dark:group-hover/bar:text-sky-400",
  },
  note: {
    Icon: StickyNote,
    noun: "Note",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    openHover:
      "group-hover/bar:bg-amber-500/10 group-hover/bar:text-amber-600 dark:group-hover/bar:text-amber-400",
  },
};

export function ArtifactResultBar({
  artifact,
  conversationId,
  peekExpanded,
  onTogglePeek,
}: ArtifactResultBarProps) {
  // Hooks run unconditionally; the working-doc title is "" for non-doc kinds.
  const liveTitle = useAppSelector(selectWorkingDocTitle(conversationId ?? ""));
  const canvas = useCanvas();
  const openNotes = useOpenNotesWindow();

  const meta = KIND_META[artifact.kind];
  const title =
    artifact.kind === "working_document" && liveTitle?.trim()
      ? liveTitle
      : artifact.title;

  function open() {
    if (artifact.kind === "working_document") {
      // Park the final version in the Canvas — the unified live workspace —
      // not a one-off sidebar. Deduped so reopening reuses the same item.
      if (conversationId) {
        canvas.open({
          type: "working_document",
          data: { conversationId, kind: "working" },
          metadata: {
            // The Canvas pane title is the neutral container label; the
            // workspace's tab strip names each doc, so this never repeats it.
            title: "Documents",
            conversationId,
            sourceMessageId: `wd:${conversationId}:working`,
          },
        });
      }
    } else if (artifact.kind === "note" && artifact.id) {
      openNotes({ initialNoteId: artifact.id, title });
    }
  }

  return (
    <div className="mb-2 flex w-full items-stretch gap-1.5">
      <button
        type="button"
        onClick={open}
        className={cn(
          "group/bar flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-left shadow-sm transition-all hover:bg-accent/40 hover:shadow-md",
          meta.hoverBorder,
        )}
        title="Open"
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            meta.chip,
          )}
        >
          <meta.Icon className="size-[18px]" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {meta.noun} · {artifact.verbPast}
          </span>
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
            meta.openHover,
          )}
        >
          <PanelRightOpen className="size-3.5" />
          Open
        </span>
      </button>
      <button
        type="button"
        onClick={onTogglePeek}
        title={peekExpanded ? "Hide details" : "Show details"}
        aria-label={peekExpanded ? "Hide details" : "Show details"}
        aria-expanded={peekExpanded}
        className="grid w-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-border/70 bg-card/40 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        {peekExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>
    </div>
  );
}
