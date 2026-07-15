"use client";

/**
 * ArtifactResultBar — THE official header for tool calls that produce
 * "known pretty data" (a document, a note — an artifact the user keeps).
 * Never for unknown/ugly payloads; those stay on the folded line + flush body.
 *
 * The model (owner-specified, 2026-07-14):
 *   • ONE full-width header bar — never broken into side-by-side buttons.
 *   • The header IS the top of the document: when expanded it squares its
 *     bottom corners and the document body attaches seamlessly beneath it
 *     (same surface, shared border, no gap) — like a sheet of paper with a
 *     letterhead.
 *   • Clicking ANYWHERE on the header toggles expand/collapse — except the
 *     Open dropdown.
 *   • The Open control is a bordered rounded-xl dropdown (down chevron) that
 *     carries ALL the destinations for this tool: the canonical pair every
 *     artifact gets (Tool Admin fullscreen view · Window Panel) plus
 *     kind-specific entries (working document → Canvas + Edit; note → Edit).
 *
 * Kind-based: add a kind in `registry/toolArtifact.ts` + a row in `KIND_META`
 * and it works everywhere. Icons follow the house rule — tinted text color
 * only, never a colored chip background.
 */

import {
  ChevronDown,
  FileText,
  Frame,
  PanelRightOpen,
  Pencil,
  StickyNote,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocTitle } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { useOpenWorkingDocumentWindow } from "@/features/overlays/openers/workingDocumentWindow";
import { cn } from "@/lib/utils";
import type { ToolArtifact, ToolArtifactKind } from "../registry/toolArtifact";

interface ArtifactResultBarProps {
  artifact: ToolArtifact;
  /** Present for the working document (its open handle); absent for id-based kinds. */
  conversationId?: string;
  /** Whether the inline body peek is currently open (drives the seam + chevron-free header). */
  peekExpanded: boolean;
  /** Toggle the inline body peek. */
  onTogglePeek: () => void;
  /** Canonical destination: the fullscreen tool view (Tool Admin). */
  onOpenOverlay?: (initialTab?: string) => void;
  /** Canonical destination: the tool-call window panel. */
  onOpenWindowPanel?: (initialTab?: string) => void;
}

interface KindMeta {
  Icon: LucideIcon;
  /** Lowercase noun for the sub-label: "Working document" / "Note". */
  noun: string;
  /** Tinted ICON color — text only, no background (house rule). */
  iconTint: string;
}

const KIND_META: Record<ToolArtifactKind, KindMeta> = {
  working_document: {
    Icon: FileText,
    noun: "Working document",
    iconTint: "text-sky-600 dark:text-sky-400",
  },
  note: {
    Icon: StickyNote,
    noun: "Note",
    iconTint: "text-amber-600 dark:text-amber-400",
  },
};

export function ArtifactResultBar({
  artifact,
  conversationId,
  peekExpanded,
  onTogglePeek,
  onOpenOverlay,
  onOpenWindowPanel,
}: ArtifactResultBarProps) {
  // Hooks run unconditionally; the working-doc title is "" for non-doc kinds.
  const liveTitle = useAppSelector(selectWorkingDocTitle(conversationId ?? ""));
  const canvas = useCanvas();
  const openNotes = useOpenNotesWindow();
  const openWorkingDocWindow = useOpenWorkingDocumentWindow();

  const meta = KIND_META[artifact.kind];
  const title =
    artifact.kind === "working_document" && liveTitle?.trim()
      ? liveTitle
      : artifact.title;

  function openCanvas() {
    if (artifact.kind === "working_document" && conversationId) {
      // Park the final version in the Canvas — the unified live workspace.
      // Deduped so reopening reuses the same item.
      canvas.open({
        type: "working_document",
        data: { conversationId, kind: "working" },
        metadata: {
          title: "Documents",
          conversationId,
          sourceMessageId: `wd:${conversationId}:working`,
        },
      });
    }
  }

  function openEdit() {
    if (artifact.kind === "working_document" && conversationId) {
      openWorkingDocWindow({ conversationId });
    } else if (artifact.kind === "note" && artifact.id) {
      openNotes({ initialNoteId: artifact.id, title });
    }
  }

  return (
    /* The whole header toggles the peek; role=button (not <button>) so the
       dropdown trigger can nest inside without invalid button-in-button. */
    <div
      role="button"
      tabIndex={0}
      aria-expanded={peekExpanded}
      onClick={onTogglePeek}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTogglePeek();
        }
      }}
      className={cn(
        "group/bar flex w-full cursor-pointer items-center gap-3 border border-border/50 bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent/30",
        // Collapsed: a full pill. Expanded: the letterhead of the attached
        // document — square bottom, no bottom border, the body continues it.
        peekExpanded ? "rounded-t-xl border-b-0" : "rounded-xl",
      )}
    >
      <meta.Icon
        className={cn("size-[18px] shrink-0", meta.iconTint)}
        strokeWidth={2.25}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {meta.noun} · {artifact.verbPast}
        </span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-label="Open options"
          >
            <PanelRightOpen className="size-3.5" />
            Open
            <ChevronDown className="size-3" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Kind-specific destinations first — the ones users actually want. */}
          {artifact.kind === "working_document" && conversationId && (
            <DropdownMenuItem onClick={openCanvas}>
              <Frame className="size-4" />
              Canvas
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={openEdit}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Canonical pair — every artifact bar has these. */}
          {onOpenWindowPanel && (
            <DropdownMenuItem onClick={() => onOpenWindowPanel()}>
              <PanelRightOpen className="size-4" />
              Window Panel
            </DropdownMenuItem>
          )}
          {onOpenOverlay && (
            <DropdownMenuItem onClick={() => onOpenOverlay()}>
              <Wrench className="size-4" />
              Tool Admin
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
