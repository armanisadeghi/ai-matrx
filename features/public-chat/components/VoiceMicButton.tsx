"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Mic, Loader2, X, History, Copy, Check } from "lucide-react";
import { FaMicrophoneLines } from "react-icons/fa6";
import { TapTargetButtonTransparent } from "@/components/icons/TapTargetButton";
import { motion, AnimatePresence } from "motion/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/lib/toast";

// Lazy-load audio hook — only imported on first mic click
const LazyVoiceEngine = dynamic(
  () => import("./VoiceMicEngine").then((m) => ({ default: m.VoiceMicEngine })),
  { ssr: false },
);

// ============================================================================
// TYPES
// ============================================================================

interface TranscriptionEntry {
  id: string;
  text: string;
  timestamp: Date;
  duration?: number;
}

interface VoiceMicButtonProps {
  disabled?: boolean;
  onTranscription: (text: string) => void;
}

// Persist transcription history in sessionStorage
const HISTORY_KEY = "voice-transcription-history";

function loadHistory(): TranscriptionEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((e: TranscriptionEntry) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  } catch {
    return [];
  }
}

function saveHistory(entries: TranscriptionEntry[]) {
  try {
    // Keep last 50 entries max
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-50)));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

// ============================================================================
// VOICE MIC BUTTON
// ============================================================================

export function VoiceMicButton({
  disabled = false,
  onTranscription,
}: VoiceMicButtonProps) {
  const [isEngineLoaded, setIsEngineLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Engine control refs — set by VoiceMicEngine
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Load history from sessionStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Handle first click — load engine and start recording
  const handleClick = useCallback(async () => {
    if (disabled) return;

    if (isRecording) {
      stopRef.current?.();
      return;
    }

    if (isTranscribing) return;

    // Load engine on first click
    if (!isEngineLoaded) {
      setIsEngineLoaded(true);
      // Engine will auto-start on mount via autoStart prop
      return;
    }

    // Engine already loaded — start recording
    await startRef.current?.();
  }, [disabled, isRecording, isTranscribing, isEngineLoaded]);

  // Handle transcription complete from engine
  const handleTranscriptionComplete = useCallback(
    (text: string, dur?: number) => {
      // Add to history
      const entry: TranscriptionEntry = {
        id: crypto.randomUUID(),
        text,
        timestamp: new Date(),
        duration: dur,
      };
      setHistory((prev) => {
        const updated = [...prev, entry];
        saveHistory(updated);
        return updated;
      });

      // Send to parent
      onTranscription(text);
    },
    [onTranscription],
  );

  // Copy history entry
  const handleCopy = useCallback(async (entry: TranscriptionEntry) => {
    await navigator.clipboard.writeText(entry.text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  // Determine button visual state
  const isActive = isRecording || isTranscribing;

  return (
    <>
      {/* Lazy engine — only mounted after first click */}
      {isEngineLoaded && (
        <LazyVoiceEngine
          startRef={startRef}
          stopRef={stopRef}
          onRecordingChange={setIsRecording}
          onTranscribingChange={setIsTranscribing}
          onAudioLevelChange={setAudioLevel}
          onDurationChange={setDuration}
          onTranscriptionComplete={handleTranscriptionComplete}
          autoStart
        />
      )}

      <div className="relative flex items-center">
        {/* Recording/transcribing indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1.5 mr-1 overflow-hidden"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"
              />
              <span className="text-xs text-red-500 dark:text-red-400 font-medium whitespace-nowrap tabular-nums">
                {Math.floor(duration / 60)}:
                {String(duration % 60).padStart(2, "0")}
              </span>
            </motion.div>
          )}
          {isTranscribing && !isRecording && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1.5 mr-1 overflow-hidden"
            >
              <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" />
              <span className="text-xs text-blue-500 font-medium whitespace-nowrap">
                Transcribing...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mic button */}
        <TapTargetButtonTransparent
          onClick={handleClick}
          disabled={disabled || (isTranscribing && !isRecording)}
          ariaLabel={
            isRecording
              ? "Stop recording"
              : isTranscribing
                ? "Transcribing..."
                : "Voice input"
          }
          icon={
            isTranscribing && !isRecording ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : isRecording ? (
              <FaMicrophoneLines
                size={16}
                className="text-red-500"
                style={{
                  filter: `drop-shadow(0 0 ${Math.min(audioLevel / 10, 8)}px currentColor)`,
                }}
              />
            ) : (
              <Mic className="h-4 w-4 text-muted-foreground" />
            )
          }
        />

        {/* History popover */}
        {history.length > 0 && !isActive && (
          <Popover open={showHistory} onOpenChange={setShowHistory}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-0.5"
                title="Transcription history"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 max-h-72 overflow-y-auto p-0"
              align="end"
              side="top"
              sideOffset={8}
            >
              <div className="px-3 py-2 border-b border-border">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                  Recent Transcriptions
                </h4>
              </div>
              <div className="p-1">
                {[...history].reverse().map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                  >
                    <p className="text-sm text-foreground flex-1 min-w-0 line-clamp-3">
                      {entry.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(entry)}
                      className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy"
                    >
                      {copiedId === entry.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </>
  );
}

export default VoiceMicButton;
