"use client";

import React, { lazy, Suspense, useState, useCallback } from "react";
import { Mic } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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
import {
  createVoicePadScope,
  VOICE_PAD_TEXT_WRITE_MODES,
  type VoicePadTextWrite,
} from "@/features/surfaces/manifests/voice-pad.manifest";

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
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, instanceId),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, instanceId),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  // Mic lifecycle, mirrored from the mic button. Emitted as scope and read by
  // the `pad_text` write guard below. `liveTranscript` alone can't stand in for
  // it: it is empty between pressing record and the first streamed chunk, and
  // again while a stopped recording is still being transcribed.
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

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
    setLiveTranscript(text);
  }, []);

  const handleRecordingStateChange = useCallback(
    (state: { isRecording: boolean; isTranscribing: boolean }) => {
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
   * Fresh closures per apply (the `getWriteHandlers` contract): this
   * component subscribes to `entries` and `draftText`, so `currentText` read
   * below is always the live buffer, never a stale snapshot.
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
     * Refuse mid-dictation. While the mic is live the textarea renders the
     * buffer with the in-progress transcript appended, and the entry it is
     * about to produce would land behind a draft the user can no longer see
     * it in. Staging into that window would quietly eat a sentence the user
     * just spoke.
     */
    const requireMicIdle = (target: string) => {
      if (liveTranscript.trim()) {
        throw new Error(
          `${target} is unavailable while the microphone is live (live_transcript is not empty). Wait for the dictation to finish.`,
        );
      }
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
        // `currentText` (not `draftText`) is the base on purpose: with no
        // draft yet, the pad is showing the joined entries, and appending
        // must carry those into the draft rather than replacing them with
        // the addition alone.
        const base = currentText.trimEnd();
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
