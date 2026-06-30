"use client";

// features/flashcards/fast-fire/capture-test/CaptureTestSurface.tsx
//
// THE PROVE-IT SURFACE (owner-mandated, core-first reset 2026-06-30). Exercises
// the REAL capture API the drill uses — startContinuousCapture / startCardClip /
// stopCardClip / stopContinuousCapture — and plays back the full-session WAV plus
// every per-card WAV with real, decoded durations + waveforms. This is the gate:
// the owner verifies the audio core works by LISTENING, before any AI grading is
// trusted. Admin-gated (selectIsAdmin). No mock, no simulation.

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Mic, Radio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  startContinuousCapture,
  startCardClip,
  stopCardClip,
  stopContinuousCapture,
  hardStopCapture,
  playBuzzer,
} from "../audio/continuousCapture";
import { AudioCaptureDebugPanel } from "../debug/AudioCaptureDebugPanel";
import { WavePlayer } from "./WavePlayer";

/** ~PAD_BEFORE + ~PAD_AFTER baked into each clip by the capture core (display only). */
const CLIP_PADDING_SEC = 5;

interface CardClip {
  cardId: string;
  blob: Blob;
  spokenSec: number;
}

export function CaptureTestSurface() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [capturing, setCapturing] = useState(false);
  const [recordingCard, setRecordingCard] = useState(false);
  const [pendingCard, setPendingCard] = useState(false);
  const [clips, setClips] = useState<CardClip[]>([]);
  const [fullClip, setFullClip] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardCounterRef = useRef(0);
  const cardStartedAtRef = useRef(0);
  const activeCardIdRef = useRef<string | null>(null);

  // Teardown safety: if the user navigates away mid-capture, kill it loudly.
  useEffect(() => {
    return () => {
      hardStopCapture();
    };
  }, []);

  const onStart = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      setClips([]);
      setFullClip(null);
      await startContinuousCapture();
      setCapturing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to start capture");
    } finally {
      setBusy(false);
    }
  }, []);

  const onStartCard = useCallback(() => {
    const id = `test-card-${++cardCounterRef.current}`;
    activeCardIdRef.current = id;
    cardStartedAtRef.current = Date.now();
    playBuzzer("start");
    startCardClip(id);
    setRecordingCard(true);
  }, []);

  const onStopCard = useCallback(() => {
    const id = activeCardIdRef.current;
    if (!id) return;
    const spokenSec = (Date.now() - cardStartedAtRef.current) / 1000;
    playBuzzer("stop");
    setRecordingCard(false);
    setPendingCard(true); // the clip resolves ~2.5s later (trailing pad)
    activeCardIdRef.current = null;
    void stopCardClip(id).then((blob) => {
      setPendingCard(false);
      if (blob) {
        setClips((prev) => [...prev, { cardId: id, blob, spokenSec }]);
      } else {
        setError(`card ${id} produced no clip`);
      }
    });
  }, []);

  const onEnd = useCallback(() => {
    setBusy(true);
    try {
      // Flushes any pending card clip, then returns the full-session WAV.
      const full = stopContinuousCapture();
      setFullClip(full);
      setCapturing(false);
      setRecordingCard(false);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center bg-textured p-6 text-center">
        <p className="text-sm text-muted-foreground">
          The audio capture test is an admin-only development surface.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <header>
          <h1 className="text-lg font-semibold text-foreground">
            Fast Fire — audio capture test
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prove the Web-Audio PCM → WAV capture core in isolation. Start a
            session, record a few cards of <em>different</em> lengths, end the
            session, then play back the full recording and each segment. Each clip
            should be the right length, contain real speech (non-silent), and carry
            a beep at its start/stop boundaries.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {!capturing ? (
            <Button onClick={onStart} disabled={busy}>
              <Radio className="mr-2 h-4 w-4" />
              Start capture
            </Button>
          ) : (
            <>
              {!recordingCard ? (
                <Button onClick={onStartCard} disabled={pendingCard}>
                  <Mic className="mr-2 h-4 w-4" />
                  Start card
                </Button>
              ) : (
                <Button onClick={onStopCard} variant="secondary">
                  <Square className="mr-2 h-4 w-4" />
                  Stop card
                </Button>
              )}
              <Button onClick={onEnd} variant="destructive" disabled={busy}>
                <CircleStop className="mr-2 h-4 w-4" />
                End session
              </Button>
            </>
          )}
          {pendingCard && (
            <span className="text-xs text-muted-foreground">
              capturing trailing pad…
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <AudioCaptureDebugPanel />

        {clips.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">
              Per-card clips ({clips.length})
            </h2>
            {clips.map((c) => (
              <WavePlayer
                key={c.cardId}
                blob={c.blob}
                label={`${c.cardId} — spoken ${c.spokenSec.toFixed(1)}s`}
                expectedSec={c.spokenSec + CLIP_PADDING_SEC}
              />
            ))}
          </section>
        )}

        {fullClip && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">
              Full session recording
            </h2>
            <WavePlayer blob={fullClip} label="Full session" />
          </section>
        )}
      </div>
    </div>
  );
}
