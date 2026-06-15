"use client";

// features/war-room/components/tile/TileAudioTab.tsx
//
// Minimal Audio view: record, "Save Only" (raw transcript, no cleanup), and
// "New Session" (a tile can own several). Reuses the transcript-studio system —
// each session is a real studio_sessions row (source='war_room') and the raw
// transcript renders from the transcriptStudio slice. Dictionary, clean output,
// and custom processing are intentionally hidden here; expand opens the full
// studio for the same session.

import { useEffect, useRef, useState } from "react";
import { Save, Plus } from "lucide-react";
import {
  MicrophoneIconButton,
  type MicrophoneIconButtonHandle,
} from "@/features/audio/components/MicrophoneIconButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSessionRawText } from "@/features/transcript-studio/redux/selectors";
import { fetchRawSegmentsThunk } from "@/features/transcript-studio/redux/thunks";
import { selectActiveAudioSessionId } from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToTile,
  ensureTileAudioSession,
  saveTileTranscript,
} from "@/features/war-room/redux/thunks";

export function TileAudioTab({ tileId }: { tileId: string }) {
  const dispatch = useAppDispatch();
  const micRef = useRef<MicrophoneIconButtonHandle>(null);
  const sessionId = useAppSelector(selectActiveAudioSessionId(tileId));
  const rawText = useAppSelector(selectSessionRawText(sessionId));

  // Live recording state is driven by the mic button's own callbacks (the
  // standalone MicrophoneIconButton doesn't populate the recordings slice).
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState("");

  // Load the active session's committed transcript when it changes.
  useEffect(() => {
    if (sessionId) dispatch(fetchRawSegmentsThunk({ sessionId }));
  }, [sessionId, dispatch]);

  async function handleComplete(text: string) {
    setLiveText("");
    const sid = sessionId ?? (await dispatch(ensureTileAudioSession(tileId)));
    if (sid) dispatch(saveTileTranscript(sid, text));
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-border/60">
        <MicrophoneIconButton
          ref={micRef}
          onTranscriptionComplete={handleComplete}
          onTranscriptOnlyComplete={handleComplete}
          onLiveTranscript={setLiveText}
          onRecordingStateChange={({ isRecording: rec }) => setIsRecording(rec)}
          size="sm"
          label="Record"
        />
        <button
          type="button"
          onClick={() => micRef.current?.stopForTranscriptOnly()}
          disabled={!isRecording}
          className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          title="Stop and save the raw transcript (no cleanup)"
        >
          <Save className="size-3.5" />
          Save Only
        </button>
        <button
          type="button"
          onClick={() => dispatch(addAudioSessionToTile(tileId))}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Start a new transcript session in this tile"
        >
          <Plus className="size-3.5" />
          New Session
        </button>
      </div>

      {/* Transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 text-sm">
        {isRecording ? (
          <p className="text-foreground whitespace-pre-wrap break-words">
            {liveText || "Listening…"}
            <span className="ml-0.5 inline-block h-3.5 w-px align-middle bg-primary animate-pulse" />
          </p>
        ) : rawText ? (
          <p className="text-foreground whitespace-pre-wrap break-words">
            {rawText}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs text-center py-6 px-2">
            Record to capture audio into this tile. &ldquo;Save Only&rdquo; keeps
            the raw transcript; expand for the full cleanup studio.
          </p>
        )}
      </div>
    </div>
  );
}
