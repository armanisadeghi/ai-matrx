"use client";

import React, { lazy, Suspense, useState, useRef, useCallback } from "react";
import { Mic } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectVoicePadEntries,
  selectVoicePadDraftText,
  addTranscriptEntry,
  removeTranscriptEntry,
  clearAllEntries,
  setDraftText,
} from "@/lib/redux/slices/voicePadSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createVoicePadScope } from "@/features/surfaces/manifests/voice-pad.manifest";

const VoicePadExpanded = lazy(() => import("./VoicePadExpanded"));

const OVERLAY_ID = "voicePad" as const;

function ExpandedLoadingFallback() {
  return (
    <div className="flex flex-1 min-h-0 items-center gap-2 text-muted-foreground text-sm p-3">
      <Mic className="h-4 w-4 animate-pulse shrink-0" />
      <span>Loading voice pad...</span>
    </div>
  );
}

interface VoicePadProps {
  instanceId: string;
}

export default function VoicePad({ instanceId }: VoicePadProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, instanceId),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, instanceId),
  );
  const [liveTranscript, setLiveTranscript] = useState("");

  /**
   * Mic lifecycle, mirrored from the mic button's `onRecordingStateChange`.
   *
   * `liveTranscript` cannot stand in for this: it is empty between pressing
   * record and the first streamed chunk, and empty again while a stopped
   * recording is still being transcribed. Both of those windows are exactly
   * when a write would eat a sentence, so the guard below needs the real
   * flags rather than a proxy for them.
   */
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  /**
   * The same mic state, kept in a ref for the write handlers.
   *
   * `applySurfaceWrite` resolves a handler BEFORE it awaits the confirm
   * dialog, so anything a guard reads out of the render closure is a snapshot
   * from before the user was even asked — and that dialog can sit open for as
   * long as the user likes. A ref read at call time cannot go stale that way.
   * This is the guard doctrine `matrx-user/chat-voice` established (which
   * reads `store.getState()` for the same reason); mic state is local
   * component state rather than Redux, so a ref is its equivalent.
   */
  const micStateRef = useRef({ isRecording: false, isTranscribing: false });
  /** Same call-time-read contract as `micStateRef` — see above. */
  const liveTranscriptRef = useRef("");

  const windowId = `voice-pad-${instanceId}`;
  const micId = `voice-pad-mic-${instanceId}`;

  const handleClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
  }, [dispatch, instanceId]);

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      setLiveTranscript("");
      if (text.trim()) {
        dispatch(
          addTranscriptEntry({ overlayId: OVERLAY_ID, instanceId, text }),
        );
      }
    },
    [dispatch, instanceId],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    liveTranscriptRef.current = text;
    setLiveTranscript(text);
  }, []);

  const handleRecordingStateChange = useCallback(
    (state: { isRecording: boolean; isTranscribing: boolean }) => {
      // Ref first: the write guard reads it, and it must be current even in
      // the same tick, before React has committed the state update below.
      micStateRef.current = state;
      setIsRecording(state.isRecording);
      setIsTranscribing(state.isTranscribing);
    },
    [],
  );

  const handleRemoveEntry = useCallback(
    (entryId: string) => {
      dispatch(
        removeTranscriptEntry({ overlayId: OVERLAY_ID, instanceId, entryId }),
      );
    },
    [dispatch, instanceId],
  );

  const handleClearAll = useCallback(() => {
    dispatch(clearAllEntries({ overlayId: OVERLAY_ID, instanceId }));
  }, [dispatch, instanceId]);

  const handleDraftChange = useCallback(
    (text: string) => {
      dispatch(setDraftText({ overlayId: OVERLAY_ID, instanceId, text }));
    },
    [dispatch, instanceId],
  );

  const allText = entries.map((e) => e.text).join("\n\n");
  const currentText = draftText !== null ? draftText : allText;
  const hasContent = currentText.trim().length > 0;

  /**
   * Write handlers for this surface's `writeTargets` (declared in
   * `features/surfaces/manifests/voice-pad.manifest.ts`).
   *
   * Both targets stage into the draft through the SAME `setDraftText` action
   * `handleDraftChange` dispatches on every keystroke — there is no second
   * write path, so an agent's rewrite is indistinguishable from the user
   * having typed it, and equally undoable.
   *
   * EVERY piece of state a handler decides on is read AT CALL TIME — the pad
   * buffer from `store.getState()`, the mic lifecycle from refs — never from
   * this render's closure.
   *
   * The closure is not safe here, and the reason is structural rather than
   * theoretical. `applySurfaceWrite` resolves the handler (and therefore this
   * factory) BEFORE it awaits the confirm dialog, so a value captured here is
   * from before the user was asked. Two concrete ways that bites this pad:
   *
   *  - An agent that stages TWO `append_draft_text` writes in one turn has
   *    both handlers resolved against the SAME pre-write buffer. The second
   *    would then compute its base from text the first had already
   *    superseded and dispatch it back, silently dropping the first — while
   *    the seam toasted success for it.
   *  - The user can start dictating while the dialog sits open. A mic guard
   *    reading a closure snapshot would see "idle", let the write through,
   *    and eat the sentence being spoken — the exact loss the guard exists
   *    to prevent.
   *
   * This is the `chat-voice` / `image-studio` guard doctrine applied here.
   *
   * What this canNOT fix, and is handled in the manifest prose instead: a
   * `draft_text` and an `append_draft_text` staged in the SAME turn. The seam
   * applies them in an order the agent does not choose, and a whole-buffer
   * replacement landing second discards the append whichever base it read.
   * Both target descriptions therefore tell the model to rewrite in one turn
   * and append in the next.
   */
  const getWriteHandlers = () => {
    /**
     * Non-empty prose, or a throw the agent reads back.
     *
     * The object check is not paranoia: the inline-tool layer parses a
     * JSON-looking argument before a handler ever sees it, so text that
     * happens to look like JSON arrives here already parsed. Saying so
     * explicitly stops the agent from "fixing" it by double-encoding, which
     * is how escaped newlines and stray quotes end up in the user's pad.
     */
    const requireText = (value: unknown, target: string): string => {
      if (typeof value !== "string") {
        throw new Error(
          `${target} expects a plain text string, got ${Array.isArray(value) ? "an array" : typeof value}. Send the text itself — do not wrap it in an object or JSON-encode it.`,
        );
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(
          `${target} expects a non-empty string. Clearing the pad is the user's own action, not a write.`,
        );
      }
      return trimmed;
    };

    /**
     * Refuse while any part of a dictation is in flight.
     *
     * A write sets `draftText`, and a non-null draft is what the textarea
     * renders — but `handleTranscriptionComplete` only pushes finished speech
     * into `entries`. So a write landing mid-dictation leaves the user reading
     * the agent's text while the words they just spoke are missing from the
     * box they are looking at.
     *
     * All three flags are checked, and read fresh. `isRecording` covers the
     * window between pressing record and the first streamed chunk, when there
     * is no live transcript yet; `isTranscribing` covers a stopped recording
     * whose text has not come back; `liveTranscript` is the belt-and-braces
     * case of streamed text with the flags somehow unreported.
     */
    const requireMicIdle = (target: string) => {
      const { isRecording: rec, isTranscribing: txn } = micStateRef.current;
      const live = liveTranscriptRef.current.trim();
      if (!rec && !txn && !live) return;
      const what = rec
        ? "the microphone is recording"
        : txn
          ? "a recording is still being transcribed"
          : "a dictation is streaming in";
      throw new Error(
        `${target} was refused because ${what} (is_recording: ${rec}, is_transcribing: ${txn}). Applying now would leave the user reading your text with the words they just spoke missing from the pad. Wait for the dictation to finish, then apply this again.`,
      );
    };

    /** The pad's live buffer, read from the store — NOT the render closure. */
    const readCurrentText = (): string => {
      const state = store.getState();
      const draft = selectVoicePadDraftText(state, OVERLAY_ID, instanceId);
      if (draft !== null) return draft;
      return selectVoicePadEntries(state, OVERLAY_ID, instanceId)
        .map((e) => e.text)
        .join("\n\n");
    };

    return {
      draft_text: (value: unknown) => {
        requireMicIdle("draft_text");
        const text = requireText(value, "draft_text");
        dispatch(setDraftText({ overlayId: OVERLAY_ID, instanceId, text }));
      },

      append_draft_text: (value: unknown) => {
        requireMicIdle("append_draft_text");
        const addition = requireText(value, "append_draft_text");
        // The CURRENT buffer (not `draftText`) is the base on purpose: with no
        // draft yet, the pad is showing the joined entries, and appending must
        // carry those into the draft rather than replacing them with the
        // addition alone. Read at call time so an append staged alongside a
        // replace builds on the replace instead of reverting it.
        const base = readCurrentText().trimEnd();
        dispatch(
          setDraftText({
            overlayId: OVERLAY_ID,
            instanceId,
            text: base ? `${base}\n\n${addition}` : addition,
          }),
        );
      },
    };
  };

  return (
    <WindowPanel
      id={windowId}
      title="Voice Pad"
      width={320}
      height={420}
      position="top-right"
      minWidth={280}
      minHeight={200}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={handleClose}
      urlSyncKey="voice"
      urlSyncId={instanceId}
      actions={
        <MicrophoneIconButton
          id={micId}
          onTranscriptionComplete={handleTranscriptionComplete}
          onLiveTranscript={handleLiveTranscript}
          onRecordingStateChange={handleRecordingStateChange}
          variant="icon-only"
          size="xs"
        />
      }
      footerRight={
        hasContent ? (
          <ContentActionBar
            content={currentText}
            title="Voice Pad Transcript"
            hideSpeaker
            hidePencil
          />
        ) : undefined
      }
    >
      {/* Nested overlay emitter — while the pad is open, its scope
          out-depths the page's provider (deepest wins). */}
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/voice-pad"
        getScope={() =>
          createVoicePadScope({
            content: currentText || undefined,
            transcript_entries: entries.map((e) => ({
              id: e.id,
              text: e.text,
            })),
            draft_text: draftText ?? undefined,
            live_transcript: liveTranscript || undefined,
            // Always emitted, so an agent can SEE a refusal coming instead of
            // discovering it by having a write bounced.
            is_recording: isRecording,
            is_transcribing: isTranscribing,
          })
        }
        isEditable
        getWriteHandlers={getWriteHandlers}
      >
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
          micButtonId={micId}
        />
      </Suspense>
      </SurfaceRuntimeProvider>
    </WindowPanel>
  );
}
