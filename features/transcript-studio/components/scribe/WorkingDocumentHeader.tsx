"use client";

import { useState } from "react";
import { ChevronRight, Maximize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
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
        <div className="max-h-[40dvh] overflow-y-auto px-4 pb-3 pt-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {docContent || (
              <span className="italic text-muted-foreground">
                Empty. Ask the agent to draft, splice, or rework your recordings
                — it builds the document here.
              </span>
            )}
          </p>
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
