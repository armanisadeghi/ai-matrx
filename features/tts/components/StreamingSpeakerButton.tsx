/**
 * StreamingSpeakerButton — single play/pause "read this aloud" button.
 *
 * ─── Why it routes through the unified queue ─────────────────────────────────
 *
 * This button speaks a COMPLETE piece of text (a finished assistant message, a
 * document, a selection). It enqueues onto the app-wide `playbackQueue`
 * singleton via `useTtsSpeak` rather than owning a Cartesia WebPlayer in a React
 * hook.
 *
 * That is the whole point: the queue lives OUTSIDE React (module scope), so
 * audio NEVER cuts off when this button unmounts — switching a war-room tab,
 * navigating to another route, or collapsing the message group keeps the audio
 * playing to completion. New utterances line up BEHIND the current one instead
 * of interrupting it (the queue is the single ordered playback path). The
 * Cartesia SDK chunk is lazy-loaded inside the queue's adapter on first use, so
 * there is still zero SDK cost until someone actually clicks play.
 *
 * The button reflects only the status of ITS OWN queued utterance
 * (queued / loading / playing / paused) and drives pause/resume on the queue.
 *
 * Dictionary pronunciation follows the single global active context by default
 * (resolved in the queue's cartesia adapter); pass `dictionarySurfaceKey` only
 * to scope it to a specific surface.
 *
 * ─── Voice preferences ──────────────────────────────────────────────────────
 *
 * `useTtsSpeak` resolves voiceId / language / speed from the Redux
 * `userPreferences.voice` slice, so the user's selected voice is always used.
 */

'use client';

import React, { useCallback } from 'react';
import { Volume2TapButton, PauseTapButton } from '@/components/icons/tap-buttons';
import { useTtsSpeak } from '@/features/audio/playback/useTtsSpeak';
import type { SpeakerVariant } from '../types';

export interface StreamingSpeakerButtonProps {
  text: string;
  /**
   * Consulted at click time, BEFORE `text` is used. Return a non-empty string
   * to speak that instead — the host passes a reader of the user's live text
   * selection so "select a part, press Speak" reads just the selection.
   * Return null/empty to fall through to `text`. The button suppresses
   * selection-clearing on mousedown so the selection survives the click.
   */
  getTextOverride?: () => string | null;
  processMarkdown?: boolean;
  variant?: SpeakerVariant;
  className?: string;
  disabled?: boolean;
  /** Short human label for the Audio panel queue row. */
  label?: string;
  /** Override the dictionary surface; defaults to the global active context. */
  dictionarySurfaceKey?: string;
}

export function StreamingSpeakerButton({
  text,
  getTextOverride,
  processMarkdown = true,
  variant,
  className,
  disabled = false,
  label,
  dictionarySurfaceKey,
}: StreamingSpeakerButtonProps) {
  const { speak, pause, resume, status } = useTtsSpeak({
    processMarkdown,
    label,
    dictionarySurfaceKey,
    // Re-adopt this text's still-playing queue item after a remount (tab switch
    // / navigation), so the button keeps reflecting + controlling audio that
    // survived in the persistent queue instead of resetting to "Play".
    adoptText: text,
  });

  // `status` is THIS surface's own utterance status (null once done / never
  // spoken). Only the currently-playing queue item can be "playing"/"paused",
  // so these map 1:1 to whether our utterance owns the queue right now.
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isBusy = status === 'loading' || status === 'queued';
  const hasText = text.trim().length > 0;

  const handleClick = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }
    if (isPaused) {
      resume();
      return;
    }
    // Busy-guard: while this utterance is loading/queued, ignore clicks so a
    // second click can't enqueue a DUPLICATE copy (which would read the message
    // twice). Mirrors SpeakerButtonCore.
    if (disabled || !hasText || isBusy) return;
    const override = getTextOverride?.()?.trim() || null;
    speak(override ?? text);
  }, [isPlaying, isPaused, disabled, hasText, isBusy, pause, resume, speak, text, getTextOverride]);

  const button = isPlaying ? (
    <PauseTapButton
      variant={variant}
      onClick={handleClick}
      disabled={disabled}
      ariaLabel="Pause"
      className={className}
    />
  ) : (
    <Volume2TapButton
      variant={variant}
      onClick={handleClick}
      disabled={disabled || !hasText || isBusy}
      ariaLabel={
        isBusy
          ? status === 'queued'
            ? 'Queued…'
            : 'Connecting…'
          : isPaused
            ? 'Resume'
            : 'Play audio (reads your selection when text is selected)'
      }
      className={className}
    />
  );

  // Preserve any live text selection so getTextOverride can read it on click
  // (mousedown default would otherwise clear the selection before onClick).
  if (getTextOverride) {
    return (
      <span onMouseDown={(e) => e.preventDefault()} className="contents">
        {button}
      </span>
    );
  }
  return button;
}
