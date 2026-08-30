/**
 * Microphone Recording Modal
 *
 * Used by MicrophoneIconButton's 'modal-controls' variant.
 * Provides the full recording experience: start, pause/resume, stop,
 * live waveform, live transcript preview, and editable result.
 *
 * States:
 *   IDLE           — big start button
 *   RECORDING      — animated waveform, pause + stop controls, live preview
 *   PAUSED         — static display, resume + stop controls
 *   TRANSCRIBING   — spinner with accumulated text preview
 *   RESULT         — editable textarea + Add More / Replace / Use This
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Loader2,
  Check,
  RotateCcw,
  Plus,
  Pause,
  Play,
  Square,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AudioLevelIndicator } from './AudioLevelIndicator';

export interface MicrophoneRecordingModalProps {
  isOpen: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
  /** Accumulated transcript text managed by parent */
  transcribedText: string | null;
  /** Live in-progress text from current recording chunk (display only) */
  livePreview: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  /** Called with the final (possibly user-edited) text */
  onAccept: (text: string) => void;
  /** Replace: clears all text and starts a fresh recording */
  onRetry: () => void;
  /** Add More: keeps current text, appends the new recording */
  onAddMore: () => void;
  onCancel: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MicrophoneRecordingModal({
  isOpen,
  isRecording,
  isTranscribing,
  isPaused,
  duration,
  audioLevel,
  transcribedText,
  livePreview,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onAccept,
  onRetry,
  onAddMore,
  onCancel,
}: MicrophoneRecordingModalProps) {
  const [editedText, setEditedText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mirror parent's accumulated text into the editable copy whenever it changes
  useEffect(() => {
    if (transcribedText !== null) setEditedText(transcribedText);
  }, [transcribedText]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editedText]);

  // Clear local copy when modal fully closes
  useEffect(() => {
    if (!isOpen) setEditedText('');
  }, [isOpen]);

  const busy    = isRecording || isTranscribing;
  const hasText = editedText.trim().length > 0;

  const isIdle       = !isRecording && !isTranscribing && !transcribedText;
  const isActiveRec  = isRecording && !isPaused;
  const isPausedRec  = isRecording && isPaused;
  const showResult   = !isRecording && !isTranscribing && hasText;

  // Prevent ESC / outside-click dismiss during active operation
  const blockDismiss = (e: Event) => { if (busy) e.preventDefault(); };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open && busy) return; // block close during recording/transcribing
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={blockDismiss}
        onEscapeKeyDown={blockDismiss}
      >
        <DialogHeader>
          <DialogTitle className="text-base">Voice Input</DialogTitle>
        </DialogHeader>

        {/* ── IDLE ──────────────────────────────────────────────────────────── */}
        {isIdle && (
          <div className="flex flex-col items-center gap-6 py-6">
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Tap the microphone to start recording. Speak clearly and we'll transcribe your words automatically.
            </p>

            <button
              type="button"
              onClick={onStartRecording}
              className={cn(
                'relative flex items-center justify-center w-24 h-24 rounded-full',
                'bg-primary/10 border-2 border-primary/30',
                'hover:bg-primary/20 hover:border-primary/60 hover:scale-105',
                'active:scale-95 transition-all duration-200 group',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label="Start recording"
            >
              <Mic className="h-10 w-10 text-primary group-hover:scale-110 transition-transform duration-200" />
            </button>

            <p className="text-xs text-muted-foreground">Tap to begin</p>
          </div>
        )}

        {/* ── RECORDING (active) ────────────────────────────────────────────── */}
        {isActiveRec && (
          <div className="flex flex-col items-center gap-5 py-4">
            {/* Audio-reactive orb */}
            <div className="relative flex items-center justify-center h-24 w-24">
              {/* Outer breathing ring */}
              <span
                className="absolute inset-0 rounded-full bg-primary/15 transition-transform duration-75"
                style={{ transform: `scale(${1 + audioLevel / 80})` }}
              />
              {/* Steady ambient ping */}
              <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
              {/* Core orb */}
              <span className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 backdrop-blur-sm">
                <Mic className="h-7 w-7 text-primary" />
              </span>
            </div>

            {/* Duration */}
            <p className="text-2xl font-mono font-light tabular-nums text-foreground tracking-tight">
              {formatDuration(duration)}
            </p>

            {/* Waveform bar */}
            <AudioLevelIndicator level={audioLevel} barCount={9} className="w-full max-w-xs" />

            {/* Live preview */}
            {livePreview && (
              <div className="w-full rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 max-h-20 overflow-y-auto">
                <p className="text-[11px] text-primary/70 mb-0.5 font-medium">Transcribing…</p>
                <p className="text-xs text-foreground/70 leading-relaxed">{livePreview}</p>
              </div>
            )}
            {/* Already accumulated text from a previous session */}
            {hasText && !livePreview && (
              <div className="w-full rounded-lg bg-muted/40 px-3 py-2 max-h-16 overflow-y-auto">
                <p className="text-[11px] text-muted-foreground mb-0.5">Previous text</p>
                <p className="text-xs leading-relaxed text-foreground/60 line-clamp-2">{editedText}</p>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPauseRecording}
                className="gap-2 min-w-[88px]"
                aria-label="Pause recording"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onStopRecording}
                className="gap-2 min-w-[88px] bg-primary hover:bg-primary/90"
                aria-label="Stop recording"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { onStopRecording(); onCancel(); }}
              className="text-muted-foreground text-xs -mt-1"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* ── PAUSED ────────────────────────────────────────────────────────── */}
        {isPausedRec && (
          <div className="flex flex-col items-center gap-5 py-4">
            {/* Static orb */}
            <div className="relative flex items-center justify-center h-24 w-24">
              <span className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-muted border-2 border-border">
                <Pause className="h-6 w-6 text-muted-foreground" />
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <p className="text-2xl font-mono font-light tabular-nums text-foreground tracking-tight">
                {formatDuration(duration)}
              </p>
              <p className="text-xs text-muted-foreground">Paused</p>
            </div>

            {/* Accumulated text preview */}
            {(hasText || livePreview) && (
              <div className="w-full rounded-lg bg-muted/40 px-3 py-2 max-h-20 overflow-y-auto">
                <p className="text-xs leading-relaxed text-foreground/70">
                  {livePreview ? livePreview : editedText}
                </p>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                onClick={onResumeRecording}
                className="gap-2 min-w-[88px]"
                aria-label="Resume recording"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Resume
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onStopRecording}
                className="gap-2 min-w-[88px]"
                aria-label="Stop recording and transcribe"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { onStopRecording(); onCancel(); }}
              className="text-muted-foreground text-xs -mt-1"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* ── TRANSCRIBING ──────────────────────────────────────────────────── */}
        {isTranscribing && !isRecording && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Finalizing transcription…</p>
            {hasText && (
              <div className="w-full rounded-lg bg-muted/50 px-3 py-2 max-h-24 overflow-y-auto">
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {editedText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── RESULT ────────────────────────────────────────────────────────── */}
        {showResult && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Transcription{' '}
                <span className="font-normal opacity-60">(tap to edit)</span>
              </label>
              <textarea
                ref={textareaRef}
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                rows={4}
                className={cn(
                  'w-full resize-none overflow-hidden rounded-md',
                  'border border-input bg-background px-3 py-2',
                  'text-sm leading-relaxed text-foreground',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'transition-shadow duration-150',
                )}
                placeholder="Your transcription will appear here…"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Left: destructive-ish actions */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="gap-1.5 text-muted-foreground shrink-0"
                title="Discard and record from scratch"
              >
                <RotateCcw className="h-3 w-3" />
                Replace
              </Button>

              {/* Right: constructive actions */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddMore}
                  className="gap-1.5 shrink-0"
                  title="Record again — appended to this text"
                >
                  <Plus className="h-3 w-3" />
                  Add More
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAccept(editedText)}
                  disabled={!hasText}
                  className="gap-1.5 shrink-0"
                >
                  <Check className="h-3 w-3" />
                  Use This
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
