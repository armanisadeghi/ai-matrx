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

  // Write half of the voice-pad surface (manifest `writeTargets`). ONE target:
  // the pad's editable draft. It stages through `handleDraftChange` — literally
  // the function the textarea's onChange calls — so an agent's text is exactly
  // as reversible as the user's own typing, and nothing persists until the user
  // sends the pad onward. Bad shapes THROW; the writeback seam turns throws into
  // error envelopes the agent reads, so never coerce. Entries and the live
  // transcript are captured evidence and have no target by design.
  // Fresh closures per call (getWriteHandlers contract) — `currentText` is read
  // at apply time, not at mount.
  const getSurfaceWriteHandlers = () => ({
    pad_text: (raw: unknown) => {
      // Refuse mid-dictation. A write sets `draftText`, and a non-null draft is
      // what the textarea renders — but `handleTranscriptionComplete` only
      // pushes finished speech into `entries`. Writing now would leave the user
      // reading the agent's text with the words they just spoke missing from
      // the box (recorded below in Session entries, but not where they look).
      if (isRecording || isTranscribing) {
        throw new Error(
          `pad_text: the user is still ${isRecording ? "recording" : "transcribing"} — their finished speech is about to land in this same box. Wait for it, then write.`,
        );
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          `pad_text expects { text: string, mode?: ${VOICE_PAD_TEXT_WRITE_MODES.join(" | ")} }.`,
        );
      }
      const write = raw as Partial<VoicePadTextWrite>;
      if (typeof write.text !== "string" || !write.text.trim()) {
        throw new Error("pad_text: text must be a non-empty string.");
      }
      const mode = write.mode ?? "replace";
      if (!(VOICE_PAD_TEXT_WRITE_MODES as readonly string[]).includes(mode)) {
        throw new Error(
          `pad_text: mode must be ${VOICE_PAD_TEXT_WRITE_MODES.join(" or ")}, got "${String(write.mode)}".`,
        );
      }
      handleDraftChange(
        mode === "append" && currentText.trim()
          ? `${currentText.replace(/\s+$/, "")}\n\n${write.text}`
          : write.text,
      );
    },
  });

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
        getWriteHandlers={getSurfaceWriteHandlers}
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
