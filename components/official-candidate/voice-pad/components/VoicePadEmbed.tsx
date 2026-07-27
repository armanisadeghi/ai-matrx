"use client";

/**
 * VoicePadEmbed — the full Voice Pad surface (header mic, transcript body,
 * footer controls) without WindowPanel chrome. Used by the attach-menu audio
 * picker and composable inside other hosts.
 */

import React, { lazy, Suspense } from "react";
import { Mic, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import type { VoicePadVariant } from "@/lib/redux/slices/voicePadSlice";
import { useVoicePadController } from "../hooks/useVoicePadController";
import {
  VoicePadFooterLeft,
  VoicePadFooterRight,
} from "./VoicePadExpanded";

const VoicePadExpanded = lazy(() => import("./VoicePadExpanded"));

function ExpandedLoadingFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2 p-3 text-sm text-muted-foreground">
      <Mic className="h-4 w-4 shrink-0 animate-pulse" />
      <span>Loading voice pad…</span>
    </div>
  );
}

export interface VoicePadEmbedProps {
  overlayId?: VoicePadVariant;
  instanceId: string;
  className?: string;
  /** Show the "New session" control in the footer (Advanced Voice Pad behavior). */
  enableNewSession?: boolean;
  /** Attach-menu mode: attach the current transcript to the composer. */
  onAttachTranscript?: (text: string) => void;
}

export function VoicePadEmbed({
  overlayId = "voicePad",
  instanceId,
  className,
  enableNewSession = true,
  onAttachTranscript,
}: VoicePadEmbedProps) {
  const {
    entries,
    draftText,
    liveTranscript,
    fontSize,
    setFontSize,
    micId,
    currentText,
    hasContent,
    handleTranscriptionComplete,
    handleLiveTranscript,
    handleRemoveEntry,
    handleClearAll,
    handleDraftChange,
    handleNewSession,
  } = useVoicePadController(overlayId, instanceId);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {/* Header — record / stop lives here (same slot as the window panel actions). */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Record & transcribe
        </span>
        <MicrophoneIconButton
          id={micId}
          onTranscriptionComplete={handleTranscriptionComplete}
          onLiveTranscript={handleLiveTranscript}
          variant="icon-only"
          size="xs"
        />
      </div>

      {/* Body */}
      <Suspense fallback={<ExpandedLoadingFallback />}>
        <VoicePadExpanded
          entries={entries}
          draftText={draftText}
          liveTranscript={liveTranscript}
          onTranscriptionComplete={handleTranscriptionComplete}
          onLiveTranscript={handleLiveTranscript}
          onRemoveEntry={handleRemoveEntry}
          onClearAll={handleClearAll}
          onDraftChange={handleDraftChange}
          fontSize={fontSize}
          micButtonId={micId}
        />
      </Suspense>

      {/* Footer — font size, copy / save / clear, optional attach. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-1">
        <div className="flex min-w-0 items-center gap-1">
          <VoicePadFooterLeft
            entries={entries}
            onNewSession={enableNewSession ? handleNewSession : undefined}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onAttachTranscript && hasContent ? (
            <>
              <button
                type="button"
                onClick={() => onAttachTranscript(currentText)}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Paperclip className="h-3 w-3" />
                Attach
              </button>
              <div className="mx-0.5 h-3 w-px bg-border/50" />
            </>
          ) : null}
          <VoicePadFooterRight
            entries={entries}
            draftText={draftText}
            onClearAll={handleClearAll}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
          />
        </div>
      </div>
    </div>
  );
}
