"use client";

import React, { lazy, Suspense, useState, useCallback } from "react";
import { Mic } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectVoicePadEntries,
  selectVoicePadDraftText,
  addTranscriptEntry,
  removeTranscriptEntry,
  clearAllEntries,
  startNewSession,
  setDraftText,
} from "@/lib/redux/slices/voicePadSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { VoicePadHistorySidebar } from "./VoicePadHistorySidebar";

const VoicePadExpanded = lazy(() => import("./VoicePadExpanded"));
import { VoicePadFooterLeft, VoicePadFooterRight } from "./VoicePadExpanded";

const OVERLAY_ID = "voicePadAdvanced" as const;

function ExpandedLoadingFallback() {
  return (
    <div className="flex flex-1 min-h-0 items-center gap-2 text-muted-foreground text-sm p-3">
      <Mic className="h-4 w-4 animate-pulse shrink-0" />
      <span>Loading voice pad...</span>
    </div>
  );
}

interface VoicePadAdvancedProps {
  instanceId: string;
}

export default function VoicePadAdvanced({ instanceId }: VoicePadAdvancedProps) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, instanceId),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, instanceId),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [fontSize, setFontSize] = useState(11);

  const windowId = `voice-pad-advanced-${instanceId}`;
  const micId = `voice-pad-advanced-mic-${instanceId}`;

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

  const handleNewSession = useCallback(() => {
    const allText = entries.map((e) => e.text).join("\n\n");
    const currentText = draftText !== null ? draftText : allText;
    if (currentText.trim()) {
      dispatch(
        openOverlay({
          overlayId: "saveToNotes",
          instanceId: crypto.randomUUID(),
          data: {
            initialContent: currentText,
            defaultFolder: "transcripts",
          },
        }),
      );
    }
    dispatch(startNewSession({ overlayId: OVERLAY_ID, instanceId }));
  }, [dispatch, entries, draftText, instanceId]);

  const handleSelectHistoryItem = useCallback(
    (text: string) => {
      handleClearAll();
      handleDraftChange(text);
    },
    [handleClearAll, handleDraftChange],
  );

  const sidebarContent = (
    <VoicePadHistorySidebar
      onClose={() => {}}
      onSelectTranscript={handleSelectHistoryItem}
    />
  );

  return (
    <WindowPanel
      id={windowId}
      title="Advanced Voice Pad"
      width={640}
      height={520}
      position="top-right"
      minWidth={480}
      minHeight={320}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={handleClose}
      urlSyncKey="voice-advanced"
      urlSyncId={instanceId}
      sidebar={sidebarContent}
      sidebarDefaultSize={200}
      sidebarMinSize={150}
      defaultSidebarOpen={false}
      footerLeft={
        <VoicePadFooterLeft entries={entries} onNewSession={handleNewSession} />
      }
      footerRight={
        <VoicePadFooterRight
          entries={entries}
          draftText={draftText}
          onClearAll={handleClearAll}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
        />
      }
      actionsRight={
        <MicrophoneIconButton
          id={micId}
          onTranscriptionComplete={handleTranscriptionComplete}
          onLiveTranscript={handleLiveTranscript}
          variant="icon-only"
          size="xs"
        />
      }
    >
      <div className="flex-1 min-w-0 flex flex-col h-full bg-background">
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
      </div>
    </WindowPanel>
  );
}
