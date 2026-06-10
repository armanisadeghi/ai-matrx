"use client";

import { useState } from "react";
import {
  ChevronRight,
  Loader2,
  Maximize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { FocusedDocumentEditor } from "./FocusedDocumentEditor";

interface AssistantScreenProps {
  sessionId: string;
}

export function AssistantScreen({ sessionId }: AssistantScreenProps) {
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;

  const [focusOpen, setFocusOpen] = useState(false);
  // Collapsed by default — the conversation owns the screen; the working
  // document is one tap away when the user wants to read or expand it.
  const [docOpen, setDocOpen] = useState(false);

  // Read-aloud uses the standard, prefs-aware speaker (reading purpose →
  // Skylar by default; user's chosen voice wins). It cleans markdown itself.
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

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Working document — collapsible accordion. The header bar carries the
          single, unavoidable separator (its bottom border). Everything below
          it is seamless: the conversation flows under the input with no
          background shift and no divider line. */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => setDocOpen((v) => !v)}
            aria-expanded={docOpen}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                docOpen && "rotate-90",
              )}
            />
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
        </div>
        {docOpen && (
          <div className="max-h-[40dvh] overflow-y-auto px-4 pb-3 pt-1">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {docContent || (
                <span className="italic text-muted-foreground">
                  Empty. Ask the agent to draft, splice, or rework your
                  recordings — it builds the document here.
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Conversation + input — the same seamless column used by the chat and
          agent-run routes. No background shift, no divider; content scrolls
          under the input. */}
      <div className="min-h-0 flex-1">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
          constrainWidth
          smartInputProps={{ sendButtonVariant: "blue" }}
        />
      </div>

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
