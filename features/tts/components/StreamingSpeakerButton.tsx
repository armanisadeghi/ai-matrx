/**
 * StreamingSpeakerButton — Single play/pause toggle, streaming variant
 *
 * ─── Lifecycle ──────────────────────────────────────────────────────────────
 *
 *  Pre-click:   Renders ONE static <Volume2TapButton onClick=engage>.
 *               Zero hooks, zero SDK, zero network. The entire bundle impact
 *               at page load is this file + the tap-buttons icon module.
 *
 *  On click:    Sets engaged=true and kicks off a single dynamic
 *               import('./StreamingSpeakerLive'). The module reference is
 *               cached at module scope, so subsequent clicks across any
 *               instance of this component don't refetch the chunk.
 *
 *  While chunk loads: Renders the EXACT SAME icon as StreamingSpeakerLive's
 *               first render — a disabled Volume2TapButton with ariaLabel
 *               "Connecting…". Because both renders produce the identical
 *               host element (same type, same variant, same disabled, same
 *               aria), React reconciles to the same DOM node: no flicker,
 *               no unmount, no re-layout.
 *
 *  Module loaded: <StreamingSpeakerLive> takes over. Its first render (while
 *               the hook is in `initialLoading: true` → phase "fetching-token")
 *               still shows the same disabled "Connecting…" icon. Then it
 *               transitions through "sending" → "playing" naturally.
 *
 * ─── Design ─────────────────────────────────────────────────────────────────
 *
 * No React.lazy, no Suspense, no next/dynamic wrapper. The shell manages the
 * dynamic import itself via a module-scoped ref + useState. This keeps the
 * render tree flat and predictable:
 *
 *     pre-click            →  <Volume2TapButton onClick=engage>
 *     click (module miss)  →  <Volume2TapButton disabled aria="Connecting…">
 *     chunk loaded         →  <StreamingSpeakerLive> → <Volume2TapButton disabled aria="Connecting…">
 *     playing              →  <StreamingSpeakerLive> → <PauseTapButton>
 *
 * Because the outermost host element is always a tap-button of the same
 * variant, React reconciliation keeps the DOM stable across all four phases.
 *
 * ─── Voice preferences ──────────────────────────────────────────────────────
 *
 * The underlying hook reads voiceId / language / speed from the Redux
 * `userPreferences.voice` slice via three primitive selectors, so the user's
 * selected voice is always used when available; the hook falls back to a
 * sensible default otherwise.
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Volume2TapButton } from '@/components/icons/tap-buttons';
import type { SpeakerVariant } from '../types';
import type { StreamingSpeakerLiveProps } from './StreamingSpeakerLive';

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
}

// Module-scoped cache: once the first instance loads the Live module, every
// subsequent instance mounts it synchronously. The Cartesia SDK chunk only
// ever fetches once per page load.
type LiveModule = typeof import('./StreamingSpeakerLive');
let cachedModule: LiveModule | null = null;
let inflightPromise: Promise<LiveModule> | null = null;

function loadLiveModule(): Promise<LiveModule> {
  if (cachedModule) return Promise.resolve(cachedModule);
  if (!inflightPromise) {
    inflightPromise = import('./StreamingSpeakerLive').then((m) => {
      cachedModule = m;
      return m;
    });
  }
  return inflightPromise;
}

export function StreamingSpeakerButton({
  text,
  getTextOverride,
  processMarkdown = true,
  variant,
  className,
  disabled = false,
}: StreamingSpeakerButtonProps) {
  const [engaged, setEngaged] = useState(false);
  // Captured once at engage-time — the selection is gone by the time the
  // Live component mounts, so it must be snapshotted on click.
  const [overrideText, setOverrideText] = useState<string | null>(null);
  const [Live, setLive] = useState<
    React.ComponentType<StreamingSpeakerLiveProps> | null
  >(() => cachedModule?.StreamingSpeakerLive ?? null);

  useEffect(() => {
    if (!engaged || Live) return undefined;
    let cancelled = false;
    loadLiveModule().then((m) => {
      if (!cancelled) setLive(() => m.StreamingSpeakerLive);
    });
    return () => {
      cancelled = true;
    };
  }, [engaged, Live]);

  const handleEngage = useCallback(() => {
    if (disabled || !text.trim()) return;
    const override = getTextOverride?.()?.trim() || null;
    setOverrideText(override);
    setEngaged(true);
  }, [disabled, text, getTextOverride]);

  // Pre-click: clickable idle icon. The mousedown guard keeps any live text
  // selection intact so `getTextOverride` can still read it on click.
  if (!engaged) {
    return (
      <span
        onMouseDown={
          getTextOverride ? (e) => e.preventDefault() : undefined
        }
        className="contents"
      >
        <Volume2TapButton
          variant={variant}
          onClick={handleEngage}
          disabled={disabled || !text.trim()}
          ariaLabel="Play audio (reads your selection when text is selected)"
          className={className}
        />
      </span>
    );
  }

  // Engaged but chunk still loading: disabled "Connecting…" icon. This is
  // the exact same element Live renders on its first frame, so swapping to
  // the live component below is a no-op for the DOM.
  if (!Live) {
    return (
      <Volume2TapButton
        variant={variant}
        disabled
        ariaLabel="Connecting…"
        className={className}
      />
    );
  }

  return (
    <Live
      text={overrideText ?? text}
      processMarkdown={processMarkdown}
      variant={variant}
      className={className}
      disabled={disabled}
    />
  );
}
