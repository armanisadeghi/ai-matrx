"use client";

/**
 * ArtifactResultBar — the persistent, full-width bar a completed artifact tool
 * leaves behind in chat.
 *
 * Most tools fold to a dim single line when done. A tool that PRODUCES something
 * the user keeps working with (the agent-edited working document) instead leaves
 * this: a professional bar that names the artifact, says what just happened, and
 * — on click — parks the final version in a resizable right sidebar so you can
 * read/edit it without leaving the conversation. A trailing chevron peeks the
 * inline diff. Rendered by `ToolCallVisualization` when `getToolArtifact` matches.
 */

import { ChevronDown, ChevronRight, FileText, PanelRightOpen } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocTitle } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useOpenWorkingDocumentPanel } from "@/features/overlays/openers/workingDocumentPanel";
import type { ToolArtifact } from "../registry/toolArtifact";

interface ArtifactResultBarProps {
  artifact: ToolArtifact;
  conversationId: string;
  /** Whether the inline diff peek is currently open (drives the chevron). */
  peekExpanded: boolean;
  /** Toggle the inline diff peek. */
  onTogglePeek: () => void;
}

export function ArtifactResultBar({
  artifact,
  conversationId,
  peekExpanded,
  onTogglePeek,
}: ArtifactResultBarProps) {
  const liveTitle = useAppSelector(selectWorkingDocTitle(conversationId));
  const openPanel = useOpenWorkingDocumentPanel();
  const title = liveTitle?.trim() ? liveTitle : artifact.title;

  return (
    <div className="mb-2 flex w-full items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => openPanel({ conversationId, title })}
        className="group/bar flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-left shadow-sm transition-all hover:border-sky-500/40 hover:bg-accent/40 hover:shadow-md"
        title="Open in sidebar"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400">
          <FileText className="size-[18px]" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Working document · {artifact.verbPast}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover/bar:bg-sky-500/10 group-hover/bar:text-sky-600 dark:group-hover/bar:text-sky-400">
          <PanelRightOpen className="size-3.5" />
          Open
        </span>
      </button>
      <button
        type="button"
        onClick={onTogglePeek}
        title={peekExpanded ? "Hide changes" : "Show changes"}
        aria-label={peekExpanded ? "Hide changes" : "Show changes"}
        aria-expanded={peekExpanded}
        className="grid w-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-card/40 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
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
