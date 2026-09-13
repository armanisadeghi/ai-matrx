"use client";

// features/question-desk/components/AnswerBar.tsx
//
// The action bar: four ways to answer, each showing its key, plus the write
// box, the saved line and the Undo.
//
// 🚨 THE WRITE BOX IS `ProTextarea`, NEVER A RAW `<textarea>` (Arman,
// 2026-09-12: *"you need to be using our protext area so that you automatically
// get all of the recording features and the other things that come along with
// it"*). Everything the mic used to need here — starting and stopping the
// shared recorder, the live level, streaming transcription, the device menu,
// the "you are still recording" protection before the box closes, the cleanup
// agent, Copy, the right-click menu — is the platform field's, and arrives free.
// This surface adds exactly two things ProTextarea cannot know: the origin
// stamp that ties a recording to THIS question (a `RecordingOriginProvider`
// around the box) and the fact that an answer came from the mic rather than the
// keyboard (`onTranscriptionComplete`), which becomes `answer_source='voice'`.
//
// EVERY CONTROL WORKS OR IS ABSENT. There is no disabled-looking button here:
// a control that cannot do its job is not rendered, and the reason is printed
// where the button would have been (the read-aloud button disappears when the
// knob's parts hold no text on this question).
//
// WHAT THE SKIP BUTTON SAYS IS A KNOB. With
// `question_desk.skip_ships_recommendation` true, skipping SHIPS the
// recommendation, and the button says exactly that; with it false, skipping
// only defers. Same key, same verdict, different consequence — so the sentence
// must never be guessed.

import type { RefObject } from "react";
import { Mic, Volume2, VolumeX } from "lucide-react";
import {
  ProTextarea,
  type ProTextareaElement,
} from "@/components/official/ProTextarea";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { cn } from "@/lib/utils";
import type { DictationAudio } from "../hooks/useDictationAudio";
import { questionRecordingOrigin } from "../hooks/useDictationAudio";

export interface SaveLine {
  tone: "ok" | "warn";
  text: string;
}

export interface AnswerBarProps {
  interviewId: string;
  questionId: string;
  questionTitle: string;
  /** The recommendation's presence decides whether key 1 exists at all. */
  hasRecommendation: boolean;
  skipShipsRecommendation: boolean;
  writing: boolean;
  draftText: string;
  onDraftChange: (next: string) => void;
  draftStorageError: string | null;
  /** True once the mic put words in the box — the save records that. */
  draftFromVoice: boolean;
  /**
   * The write box's node, typed as `ProTextareaElement` so the interview can
   * drive its microphone (`startDictation` / `stopDictation` / `isDictating`)
   * without this surface owning a recorder of its own.
   */
  textareaRef: RefObject<ProTextareaElement | null>;
  onTranscriptionComplete: (text: string) => void;
  audio: DictationAudio;
  onOpenWrite: () => void;
  /** Open the box and start its microphone — the V key's other door. */
  onAnswerByVoice: () => void;
  onTakeRecommendation: () => void;
  onSkip: () => void;
  onHandBack: () => void;
  onSaveOwnWords: () => void;
  onDiscardDraft: () => void;
  speaking: boolean;
  canReadAloud: boolean;
  onReadAloud: () => void;
  onStopReading: () => void;
  onToggleView: () => void;
  /**
   * A refusal from an action in THIS bar (read-aloud that could not speak,
   * etc.). It renders ABOVE the buttons, inside the sticky bar, because a
   * refusal printed under a sticky bar lands below the fold and the person
   * sees nothing happen at all (verifier finding 1, 2026-09-12).
   */
  actionError: string | null;
  saveLine: SaveLine | null;
  undoAvailable: boolean;
  onUndo: () => void;
  busy: boolean;
}

export function AnswerBar(props: AnswerBarProps) {
  const {
    interviewId,
    questionId,
    questionTitle,
    hasRecommendation,
    skipShipsRecommendation,
    writing,
    draftText,
    onDraftChange,
    draftStorageError,
    draftFromVoice,
    textareaRef,
    onTranscriptionComplete,
    audio,
    onOpenWrite,
    onAnswerByVoice,
    onTakeRecommendation,
    onSkip,
    onHandBack,
    onSaveOwnWords,
    onDiscardDraft,
    speaking,
    canReadAloud,
    onReadAloud,
    onStopReading,
    onToggleView,
    actionError,
    saveLine,
    undoAvailable,
    onUndo,
    busy,
  } = props;

  return (
    // The bar floats over the question as it scrolls, so what is behind it must
    // be UNREADABLE, not faintly legible: a short fade, then a solid ground the
    // controls sit on. With a transparent band the recommendation card showed
    // through between the buttons at 900px and the screen read as two things at
    // once.
    <div className="sticky bottom-0 mt-8 max-w-[820px]">
      <div
        aria-hidden
        className="h-8 bg-gradient-to-b from-transparent to-background"
      />
      <div className="bg-background pb-2">
        {actionError ? (
          <p
            role="alert"
            className="mb-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
          >
            {actionError}
          </p>
        ) : null}
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
          <Act keyCap="V" onClick={onAnswerByVoice} busy={busy}>
            <Mic className="size-3.5" aria-hidden />
            Answer by voice
          </Act>

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

        {writing ? (
          <div className="mb-2.5">
            <RecordingOriginProvider
              origin={questionRecordingOrigin(
                interviewId,
                questionId,
                questionTitle,
              )}
            >
              <ProTextarea
                ref={textareaRef as RefObject<HTMLTextAreaElement>}
                value={draftText}
                onChange={(event) => onDraftChange(event.target.value)}
                onTranscriptionComplete={onTranscriptionComplete}
                placeholder="In your own words, typed or spoken. It is recorded exactly as you give it."
                autoGrow
                minHeight={96}
                maxHeight={340}
                enableTextStats
                // The Send button is deliberately NOT wired: this surface owns
                // the save so its own refusal sentence ("Write something first…")
                // is what a person sees, and ProTextarea's submit gate would
                // silently refuse a whitespace-only answer with no words at all.
              />
            </RecordingOriginProvider>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Act primary keyCap="⌘↵" onClick={onSaveOwnWords} busy={busy}>
                Save this answer
              </Act>
              {draftText.length > 0 ? (
                // No key cap: Esc CLOSES the box and keeps every word, so
                // printing "Esc" on the destructive control would be a lie.
                <button
                  type="button"
                  onClick={onDiscardDraft}
                  className="rounded-md border border-border bg-card px-3.5 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Discard
                </button>
              ) : null}
              <span className="font-mono text-[10.5px] text-muted-foreground">
                To speak it, press V or tap the microphone at the top-right of
                the box. Esc stops the microphone.
              </span>
            </div>
            {draftFromVoice ? (
              <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                Saved as a spoken answer, exactly as it was transcribed.
              </p>
            ) : null}
            {audio.error ? (
              <p className="mt-1.5 text-[12.5px] text-destructive">
                {audio.error}
                {audio.retry ? (
                  <button
                    type="button"
                    onClick={audio.retry}
                    className="ml-2 underline underline-offset-2"
                  >
                    Try saving the recording again
                  </button>
                ) : null}
              </p>
            ) : null}
            {draftStorageError ? (
              <p className="mt-2 text-[12.5px] text-warning">
                {draftStorageError}
              </p>
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
