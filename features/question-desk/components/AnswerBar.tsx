"use client";

// features/question-desk/components/AnswerBar.tsx
//
// The action bar: four ways to answer, each showing its key, plus the write
// box, the voice panel, the saved line and the Undo.
//
// EVERY CONTROL WORKS OR IS ABSENT. There is no disabled-looking button here:
// a control that cannot do its job is not rendered, and the reason is printed
// where the button would have been. Two live examples — "Answer by voice"
// disappears on a route with no recorder mounted and says so; the read-aloud
// button disappears when the knob's parts hold no text on this question.
//
// WHAT THE SKIP BUTTON SAYS IS A KNOB. With
// `question_desk.skip_ships_recommendation` true, skipping SHIPS the
// recommendation, and the button says exactly that; with it false, skipping
// only defers. Same key, same verdict, different consequence — so the sentence
// must never be guessed.

import type { RefObject } from "react";
import { Loader2, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceAnswer } from "../hooks/useVoiceAnswer";

export interface SaveLine {
  tone: "ok" | "warn";
  text: string;
}

export interface AnswerBarProps {
  /** The recommendation's presence decides whether key 1 exists at all. */
  hasRecommendation: boolean;
  skipShipsRecommendation: boolean;
  writing: boolean;
  draftText: string;
  onDraftChange: (next: string) => void;
  draftStorageError: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOpenWrite: () => void;
  onTakeRecommendation: () => void;
  onSkip: () => void;
  onHandBack: () => void;
  onSaveOwnWords: () => void;
  voice: VoiceAnswer;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSaveVoice: () => void;
  onDiscardVoice: () => void;
  speaking: boolean;
  canReadAloud: boolean;
  onReadAloud: () => void;
  onStopReading: () => void;
  onToggleView: () => void;
  saveLine: SaveLine | null;
  undoAvailable: boolean;
  onUndo: () => void;
  busy: boolean;
}

export function AnswerBar(props: AnswerBarProps) {
  const {
    hasRecommendation,
    skipShipsRecommendation,
    writing,
    draftText,
    onDraftChange,
    draftStorageError,
    textareaRef,
    onOpenWrite,
    onTakeRecommendation,
    onSkip,
    onHandBack,
    onSaveOwnWords,
    voice,
    onStartVoice,
    onStopVoice,
    onSaveVoice,
    onDiscardVoice,
    speaking,
    canReadAloud,
    onReadAloud,
    onStopReading,
    onToggleView,
    saveLine,
    undoAvailable,
    onUndo,
    busy,
  } = props;

  return (
    <div className="sticky bottom-0 mt-8 max-w-[820px] bg-gradient-to-b from-transparent to-background to-26% pt-6">
      <div className="mb-2.5 flex flex-wrap gap-2">
        {hasRecommendation ? (
          <Act primary keyCap="1" onClick={onTakeRecommendation} busy={busy}>
            Go with your recommendation
          </Act>
        ) : null}
        <Act keyCap="2" onClick={onSkip} busy={busy}>
          {skipShipsRecommendation ? "Skip — ship it anyway" : "Skip — defer"}
        </Act>
        <Act keyCap="3" onClick={onHandBack} busy={busy}>
          Not mine — you decide
        </Act>
        <Act keyCap="W" onClick={onOpenWrite} busy={busy}>
          Write an answer
        </Act>
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        {voice.available ? (
          voice.phase === "listening" ? (
            <Act keyCap="V" onClick={onStopVoice} busy={false}>
              <Square className="size-3.5 text-destructive" aria-hidden />
              Listening… stop
            </Act>
          ) : voice.phase === "transcribing" ? (
            <Act keyCap="V" onClick={() => undefined} busy>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Writing down what you said…
            </Act>
          ) : (
            <Act keyCap="V" onClick={onStartVoice} busy={busy}>
              <Mic className="size-3.5" aria-hidden />
              Answer by voice
            </Act>
          )
        ) : (
          <p className="self-center font-mono text-[10.5px] text-muted-foreground">
            Voice answers need the recorder, which this page did not load.
            Reload the page to answer out loud.
          </p>
        )}

        {canReadAloud ? (
          speaking ? (
            <Act keyCap="R" onClick={onStopReading} busy={false}>
              <VolumeX className="size-3.5" aria-hidden />
              Stop reading
            </Act>
          ) : (
            <Act keyCap="R" onClick={onReadAloud} busy={busy}>
              <Volume2 className="size-3.5" aria-hidden />
              Read aloud
            </Act>
          )
        ) : null}

        <Act keyCap="T" onClick={onToggleView} busy={false}>
          Table view
        </Act>
      </div>

      {voice.phase === "listening" ? (
        <div className="mb-2.5 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-destructive">
            Listening…
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destructive transition-[width] duration-75"
              style={{ width: `${Math.min(100, Math.max(2, voice.level))}%` }}
            />
          </div>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            Esc cancels
          </span>
        </div>
      ) : null}

      {voice.phase === "transcript" ? (
        <div className="mb-2.5 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
            What you said — saved exactly like this
          </p>
          {voice.editing ? (
            <textarea
              ref={textareaRef}
              value={voice.transcript}
              onChange={(event) => voice.setTranscript(event.target.value)}
              className="min-h-[84px] w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-base text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          ) : (
            <p className="qd-editorial m-0 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">
              {voice.transcript}
            </p>
          )}
          {voice.audioError ? (
            <p className="mt-2 text-[12.5px] text-destructive">
              {voice.audioError}
              {voice.retryAudio ? (
                <button
                  type="button"
                  onClick={voice.retryAudio}
                  className="ml-2 underline underline-offset-2"
                >
                  Try saving the recording again
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Act primary keyCap="↵" onClick={onSaveVoice} busy={busy}>
              Save this answer
            </Act>
            {voice.editing ? null : (
              <Act keyCap="E" onClick={voice.beginEditing} busy={false}>
                Edit it first
              </Act>
            )}
            <Act keyCap="Esc" onClick={onDiscardVoice} busy={false}>
              Discard
            </Act>
          </div>
        </div>
      ) : null}

      {writing ? (
        <div className="mb-2.5">
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="In your own words. It is recorded exactly as you write it."
            className="min-h-[84px] w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-base text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Act primary keyCap="⌘↵" onClick={onSaveOwnWords} busy={busy}>
              Save this answer
            </Act>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              Esc closes the box — your words are kept
            </span>
          </div>
          {draftStorageError ? (
            <p className="mt-2 text-[12.5px] text-warning">{draftStorageError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-4 items-center gap-3">
        {saveLine ? (
          <span
            className={cn(
              "font-mono text-[11px] tracking-wide",
              saveLine.tone === "ok" ? "text-success" : "text-warning",
            )}
          >
            {saveLine.text}
          </span>
        ) : null}
        {undoAvailable ? (
          <button
            type="button"
            onClick={onUndo}
            className="rounded font-mono text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Undo (⌘Z)
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Act({
  keyCap,
  onClick,
  children,
  primary,
  busy,
}: {
  keyCap: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3.5 py-2.5 text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        primary
          ? "border-primary bg-primary text-primary-foreground hover:brightness-110"
          : "border-border bg-card text-foreground hover:border-primary hover:text-primary",
      )}
    >
      <kbd className="rounded border border-current px-1 font-mono text-[10px] opacity-65">
        {keyCap}
      </kbd>
      {children}
    </button>
  );
}
