"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Maximize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useWorkingDocumentDraft } from "../../hooks/useWorkingDocumentDraft";
import { FocusedDocumentEditor } from "./FocusedDocumentEditor";

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

  const handleReadAloud = async () => {
    if (!docContent.trim()) return;
    if (reading) {
      await speaker.stop();
      return;
    }
    await speaker.speak(docContent);
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
        <div className="flex max-h-[40dvh] flex-col px-2 pb-2 pt-1">
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
          <textarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            placeholder="Empty. Ask the agent to draft, splice, or rework your recordings — or type here. Your edits and the agent's stay in sync each round."
            className="min-h-[8rem] flex-1 resize-none rounded-md bg-muted/40 px-3 py-2 text-base leading-relaxed text-foreground outline-none ring-1 ring-inset ring-transparent transition-shadow placeholder:text-muted-foreground focus:bg-background focus:ring-border"
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
    </div>
  );
}
