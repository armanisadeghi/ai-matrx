"use client";

import React, { useRef, useCallback, useState } from "react";
import { Mic, Plus, Minus, Type, X } from "lucide-react";
import ActionFeedbackButton from "@/components/official/ActionFeedbackButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { cn } from "@/lib/utils";

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface VoicePadExpandedProps {
  entries: TranscriptEntry[];
  /** null = no draft (show entries joined); string = user-edited buffer (takes over, even when empty). */
  draftText: string | null;
  liveTranscript?: string;
  onTranscriptionComplete: (text: string) => void;
  onLiveTranscript?: (text: string) => void;
  onRemoveEntry: (id: string) => void;
  onClearAll: () => void;
  onDraftChange: (text: string) => void;
  fontSize?: number;
  micButtonId: string;
}

export interface VoicePadFooterProps {
  entries: TranscriptEntry[];
  draftText: string | null;
  onClearAll: () => void;
  onNewSession?: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function VoicePadFooterLeft({
  entries,
  onNewSession,
}: Pick<VoicePadFooterProps, "entries" | "onNewSession">) {
  return (
    <>
      <ActionFeedbackButton
        icon={<Plus />}
        tooltip="New session"
        onClick={onNewSession}
        className="text-muted-foreground"
      />
      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </span>
    </>
  );
}

export function VoicePadFooterRight({
  entries,
  draftText,
  onClearAll,
  fontSize,
  onFontSizeChange,
}: VoicePadFooterProps) {
  const allText = entries.map((e) => e.text).join("\n\n");
  const text = draftText !== null ? draftText : allText;
  const hasContent = text.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => onFontSizeChange(Math.max(9, fontSize - 1))}
        className="p-0.5 rounded hover:bg-accent/60 transition-colors text-muted-foreground"
        title="Decrease font size"
      >
        <Minus />
      </button>
      <Type className="text-muted-foreground/70" />
      <button
        type="button"
        onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
        className="p-0.5 rounded hover:bg-accent/60 transition-colors text-muted-foreground"
        title="Increase font size"
      >
        <Plus />
      </button>
      {(hasContent || entries.length > 0) && (
        <>
          <div className="mx-0.5 h-3 w-px bg-border/50" />
          <ContentActionBar
            content={text}
            title="Voice Pad Transcript"
            hideSpeaker
            hidePencil
            onDelete={onClearAll}
            deleteAriaLabel="Clear"
          />
        </>
      )}
    </>
  );
}

export default function VoicePadExpanded({
  entries,
  draftText,
  liveTranscript,
  onRemoveEntry,
  onClearAll,
  onDraftChange,
  fontSize = 11,
  micButtonId,
}: VoicePadExpandedProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const allText = entries.map((e) => e.text).join("\n\n");
  // Once the user has typed anything (including deleting everything) the draft takes
  // over — we must not fall back to `allText`, or the entries "come back" when the
  // textarea is emptied.
  const baseText = draftText !== null ? draftText : allText;
  const displayText = liveTranscript
    ? baseText
      ? baseText + "\n\n" + liveTranscript
      : liveTranscript
    : baseText;

  const [isEngaged, setIsEngaged] = useState(false);

  const handleStartRecording = () => {
    setIsEngaged(true);
    document.getElementById(micButtonId)?.click();
  };

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDraftChange(e.target.value);
    },
    [onDraftChange],
  );

  const hasContent =
    entries.length > 0 ||
    draftText !== null ||
    (!!liveTranscript && liveTranscript.trim().length > 0);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <textarea
          ref={textareaRef}
          value={displayText}
          onChange={handleTextareaChange}
          placeholder="Transcribed text appears here..."
          className={cn(
            "min-h-0 w-full flex-1 resize-none rounded-md",
            "border-none px-2 py-1.5",
            "leading-snug text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-ring",
            !hasContent && "hidden",
          )}
          style={{ fontSize: `${fontSize}px` }}
        />

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center py-4 text-center",
            hasContent && "hidden",
          )}
        >
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={isEngaged}
            className={cn(
              "rounded-full p-4 mb-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring relative flex items-center justify-center",
              isEngaged
                ? "bg-primary/20 scale-110"
                : "bg-primary/10 hover:bg-primary/20",
            )}
            title="Start recording"
          >
            {isEngaged && (
              <span
                className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
                style={{ animationDuration: "1.5s" }}
              />
            )}
            <Mic
              className={cn(
                "h-6 w-6 border-0 relative z-10",
                isEngaged ? "text-primary" : "text-muted-foreground",
              )}
            />
          </button>
          <p className="text-[11px] text-muted-foreground">
            {isEngaged ? "Listening..." : "Tap the mic to start recording"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Transcriptions persist across page navigation
          </p>
        </div>

        {entries.length > 0 && (
          <div className="max-h-[100px] shrink-0 overflow-y-auto border border-border/40 rounded-md px-2 py-1">
            <div className="text-[10px] font-medium text-muted-foreground/70 mb-1">
              Session entries
            </div>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-start gap-1 py-0.5 text-[11px] leading-tight"
              >
                <span className="text-muted-foreground/50 shrink-0 mt-0.5 tabular-nums">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="text-foreground/80 flex-1 line-clamp-1">
                  {entry.text}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveEntry(entry.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label="Remove entry"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
