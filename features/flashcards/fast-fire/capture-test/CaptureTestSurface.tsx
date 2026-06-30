"use client";

// features/flashcards/fast-fire/capture-test/CaptureTestSurface.tsx
//
// THE PROVE-IT / DEBUG SURFACE (owner-mandated, kept permanently). Exercises the
// REAL capture API the drill uses — startContinuousCapture / startCardClip /
// stopCardClip / stopContinuousCapture — and plays back the full-session WAV plus
// every per-card WAV with real, decoded durations + waveforms. Two modes:
//   • Manual    — click Start/Stop card to mark boundaries by hand.
//   • Auto-cut  — set seconds-per-card + a card count; it cuts cards on a timer,
//                 simulating the real timed drill (no AI), then auto-ends.
// Admin-gated (selectIsAdmin). No mock, no simulation — real audio, real playback.

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Mic, Radio, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
/** Gap between auto-cut cards (mirrors the drill's advance beat). */
const AUTO_GAP_MS = 600;

type Mode = "manual" | "auto";

interface CardClip {
  cardId: string;
  blob: Blob;
  spokenSec: number;
}

export function CaptureTestSurface() {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [mode, setMode] = useState<Mode>("manual");
  const [autoSeconds, setAutoSeconds] = useState(12);
  const [autoCards, setAutoCards] = useState(3);

  const [capturing, setCapturing] = useState(false);
  const [recordingCard, setRecordingCard] = useState(false);
  const [pendingCard, setPendingCard] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [clips, setClips] = useState<CardClip[]>([]);
  const [fullClip, setFullClip] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardCounterRef = useRef(0);
  const cardStartedAtRef = useRef(0);
  const activeCardIdRef = useRef<string | null>(null);
  const autoRunningRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  // Teardown safety: navigating away mid-capture kills it loudly.
  useEffect(() => {
    return () => {
      autoRunningRef.current = false;
      clearAutoTimer();
      hardStopCapture();
    };
  }, []);

  const captureCard = useCallback((spokenSec: number, cardId: string) => {
    setPendingCard(true);
    void stopCardClip(cardId).then((blob) => {
      setPendingCard(false);
      if (blob) {
        setClips((prev) => [...prev, { cardId, blob, spokenSec }]);
      } else {
        setError(`card ${cardId} produced no clip`);
      }
    });
  }, []);

  const endSession = useCallback(() => {
    autoRunningRef.current = false;
    setAutoRunning(false);
    clearAutoTimer();
    setBusy(true);
    try {
      const full = stopContinuousCapture(); // flushes any pending card clip
      setFullClip(full);
      setCapturing(false);
      setRecordingCard(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const onStart = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      setClips([]);
      setFullClip(null);
      cardCounterRef.current = 0;
      await startContinuousCapture();
      setCapturing(true);
      if (mode === "auto") {
        autoRunningRef.current = true;
        setAutoRunning(true);
        // Auto-cut loop: tunables are frozen for the run (inputs disabled while
        // capturing), so capture them here and recurse via setTimeout. A local
        // function — not a hook — so it can reference itself freely.
        const seconds = autoSeconds;
        const runCard = (remaining: number): void => {
          if (!autoRunningRef.current) return;
          if (remaining <= 0) {
            endSession();
            return;
          }
          const id = `test-card-${++cardCounterRef.current}`;
          const startedAt = Date.now();
          playBuzzer("start");
          startCardClip(id);
          autoTimerRef.current = setTimeout(() => {
            const spokenSec = (Date.now() - startedAt) / 1000;
            playBuzzer("stop");
            captureCard(spokenSec, id);
            autoTimerRef.current = setTimeout(
              () => runCard(remaining - 1),
              AUTO_GAP_MS,
            );
          }, seconds * 1000);
        };
        runCard(Math.max(1, autoCards));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to start capture");
    } finally {
      setBusy(false);
    }
  }, [mode, autoSeconds, autoCards, captureCard, endSession]);

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
    activeCardIdRef.current = null;
    captureCard(spokenSec, id);
  }, [captureCard]);

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
            Prove the Web-Audio PCM → WAV capture core. Each clip should be the
            right length, contain real speech (non-silent), and carry a beep at its
            start/stop boundaries.
          </p>
        </header>

        {/* Mode + auto settings */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setMode("manual")}
              disabled={capturing}
              className={`px-3 py-1.5 text-sm ${mode === "manual" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setMode("auto")}
              disabled={capturing}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm ${mode === "auto" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <Timer className="h-3.5 w-3.5" /> Auto-cut
            </button>
          </div>

          {mode === "auto" && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <label className="inline-flex items-center gap-1.5">
                seconds/card
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={autoSeconds}
                  disabled={capturing}
                  onChange={(e) => setAutoSeconds(Number(e.target.value) || 1)}
                  className="h-8 w-16"
                />
              </label>
              <label className="inline-flex items-center gap-1.5">
                cards
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={autoCards}
                  disabled={capturing}
                  onChange={(e) => setAutoCards(Number(e.target.value) || 1)}
                  className="h-8 w-16"
                />
              </label>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!capturing ? (
            <Button onClick={onStart} disabled={busy}>
              <Radio className="mr-2 h-4 w-4" />
              {mode === "auto" ? "Start auto-cut run" : "Start capture"}
            </Button>
          ) : (
            <>
              {mode === "manual" &&
                (!recordingCard ? (
                  <Button onClick={onStartCard} disabled={pendingCard}>
                    <Mic className="mr-2 h-4 w-4" />
                    Start card
                  </Button>
                ) : (
                  <Button onClick={onStopCard} variant="secondary">
                    <Square className="mr-2 h-4 w-4" />
                    Stop card
                  </Button>
                ))}
              <Button onClick={endSession} variant="destructive" disabled={busy}>
                <CircleStop className="mr-2 h-4 w-4" />
                End session
              </Button>
            </>
          )}
          {autoRunning && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Timer className="h-3 w-3 animate-pulse" /> auto-cutting every{" "}
              {autoSeconds}s…
            </span>
          )}
          {pendingCard && !autoRunning && (
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
