"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectVoicePadDraftText,
  selectVoicePadEntries,
  addTranscriptEntry,
  clearAllEntries,
  removeTranscriptEntry,
  setDraftText,
  startNewSession,
  type VoicePadVariant,
} from "@/lib/redux/slices/voicePadSlice";

export function useVoicePadController(
  overlayId: VoicePadVariant,
  instanceId: string,
) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, overlayId, instanceId),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, overlayId, instanceId),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [fontSize, setFontSize] = useState(11);

  const micId = useMemo(
    () => `voice-pad-mic-${overlayId}-${instanceId}`,
    [overlayId, instanceId],
  );

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      setLiveTranscript("");
      if (text.trim()) {
        dispatch(
          addTranscriptEntry({ overlayId, instanceId, text }),
        );
      }
    },
    [dispatch, instanceId, overlayId],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  const handleRemoveEntry = useCallback(
    (entryId: string) => {
      dispatch(
        removeTranscriptEntry({ overlayId, instanceId, entryId }),
      );
    },
    [dispatch, instanceId, overlayId],
  );

  const handleClearAll = useCallback(() => {
    dispatch(clearAllEntries({ overlayId, instanceId }));
  }, [dispatch, instanceId, overlayId]);

  const handleDraftChange = useCallback(
    (text: string) => {
      dispatch(setDraftText({ overlayId, instanceId, text }));
    },
    [dispatch, instanceId, overlayId],
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
    dispatch(startNewSession({ overlayId, instanceId }));
  }, [dispatch, draftText, entries, instanceId, overlayId]);

  const allText = entries.map((e) => e.text).join("\n\n");
  const currentText = draftText !== null ? draftText : allText;
  const hasContent = currentText.trim().length > 0;

  return {
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
  };
}
