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
    </WindowPanel>
  );
}
