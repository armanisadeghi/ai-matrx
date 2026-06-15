"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  GitCompare,
  Loader2,
  Maximize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useWorkingDocumentDraft } from "../../hooks/useWorkingDocumentDraft";
import { useWorkingDocChanges } from "../../hooks/useWorkingDocChanges";
import { FocusedDocumentEditor } from "./FocusedDocumentEditor";
import { WorkingDocDiff } from "./WorkingDocDiff";

interface WorkingDocumentHeaderProps {
  sessionId: string;
}

/**
 * Collapsible "Working document" accordion — the single source of truth for
 * how the working doc is surfaced inside a session. Used by BOTH the Agent tab
 * and the Live tab so the document is shown identically everywhere (read it,
 * read it aloud, open the focused editor). Self-contained: it reads the doc
 * from `useStudioAssistant` and owns its own open / read-aloud / focus state.
 */
export function WorkingDocumentHeader({
  sessionId,
}: WorkingDocumentHeaderProps) {
  const assistant = useStudioAssistant(sessionId);
  const [focusOpen, setFocusOpen] = useState(false);
  // Collapsed by default — the screen below owns the focus; the document is
  // one tap away when the user wants to read or expand it.
  const [docOpen, setDocOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const speaker = useCartesiaSpeaker({ purpose: "reading" });
  const reading = speaker.isPlaying || speaker.isLoading;

  const workingDoc = assistant.workingDocument;
  const docContent = workingDoc?.content ?? "";

  // Inline editing — the document is collaborative: the agent updates it each
  // round and the user edits it back. Shares the same draft/autosave/realtime-
  // merge logic as the full-screen FocusedDocumentEditor.
  const { draft, saving, onChange, flush } = useWorkingDocumentDraft(
    sessionId,
    workingDoc?.id,
    docContent,
  );

  // "What the agent last changed" — diffs the content the user last saw against
  // the live (agent-edited) content. The user's own edits flow through `draft`,
  // so they are never flagged as agent changes. The affordance below appears
  // only when there is a genuine unseen agent change.
  const changes = useWorkingDocChanges(docContent, draft);
  const [diffOpen, setDiffOpen] = useState(false);

  const copyText = draft.trim() || docContent.trim();

  const handleReadAloud = async () => {
    if (!docContent.trim()) return;
    if (reading) {
      await speaker.stop();
      return;
    }
    await speaker.speak(docContent);
  };

  const handleCopy = async () => {
    const text = draft || docContent;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 450);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setDocOpen((v) => !v)}
          aria-expanded={docOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Working document
          </span>
          {!docOpen && docContent.trim() && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/70">
              {docContent.replace(/[#*`>\-\n]+/g, " ").trim()}
            </span>
          )}
        </button>
        {changes.hasUnseenChange && (
          <button
            type="button"
            onClick={() => setDiffOpen(true)}
            aria-label="View the agent's latest changes"
            title="View the agent's latest changes"
            className="relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-primary active:bg-accent"
          >
            <GitCompare className="h-4 w-4" />
            <span className="hidden sm:inline">View changes</span>
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        )}
        <button
          type="button"
          onClick={handleReadAloud}
          disabled={!docContent.trim()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            docContent.trim()
              ? "text-foreground active:bg-accent"
              : "text-muted-foreground/50",
          )}
          aria-label={reading ? "Stop reading" : "Read aloud"}
        >
          {reading ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!copyText}
          aria-label={hasCopied ? "Copied" : "Copy document"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            copyText
              ? hasCopied
                ? "text-green-500 active:bg-accent"
                : "text-foreground active:bg-accent"
              : "text-muted-foreground/50",
          )}
        >
          {hasCopied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setFocusOpen(true)}
          disabled={!workingDoc}
          aria-label="Open focused editor"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            workingDoc
              ? "text-foreground active:bg-accent"
              : "text-muted-foreground/50",
          )}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setDocOpen((v) => !v)}
          aria-expanded={docOpen}
          aria-label={
            docOpen ? "Collapse working document" : "Expand working document"
          }
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              docOpen && "rotate-90",
            )}
          />
        </button>
      </div>
      {docOpen && (
        <div className="flex flex-col px-2 pb-2 pt-1">
          <div className="mb-1 flex items-center justify-end px-2 text-[11px] text-muted-foreground">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
          </div>
          {/* resize-y: the user drags the textarea taller/shorter and the
              header (shrink-0 in the column) grows with it — no separate
              container height to manage. ProTextarea owns mic + copy controls. */}
          <ProTextarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            placeholder="Empty. Ask the agent to draft, splice, or rework your recordings — or type here. Your edits and the agent's stay in sync each round."
            className="h-40 max-h-[70dvh] min-h-[6rem] resize-y overflow-y-auto bg-muted/40 text-base leading-relaxed text-foreground focus:bg-background"
          />
        </div>
      )}

      {focusOpen && workingDoc && (
        <FocusedDocumentEditor
          sessionId={sessionId}
          doc={workingDoc}
          onClose={() => setFocusOpen(false)}
        />
      )}

      {diffOpen && (
        <WorkingDocDiff
          before={changes.before}
          after={changes.after}
          title={workingDoc?.title}
          onClose={() => setDiffOpen(false)}
          onAccept={() => {
            changes.markSeen();
            setDiffOpen(false);
          }}
        />
      )}
    </div>
  );
}
