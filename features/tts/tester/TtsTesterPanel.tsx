"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Pause, Play, RotateCcw, Square } from "lucide-react";
import { WebPlayer } from "@cartesia/cartesia-js";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  EMOTION_OPTIONS,
  EMPTY_METRICS,
  runTtsTest,
  TEST_MODEL_OPTIONS,
  TEST_VOICE_OPTIONS,
  type TtsRunHandle,
  type TtsRunMetrics,
  type TtsRunPhase,
  type TtsTestConfig,
} from "./cartesiaTestEngine";

interface TtsTesterPanelProps {
  title: string;
  text: string;
  initialConfig: TtsTestConfig;
  accent?: string;
}

const selectCls =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-muted-foreground">
        {label}
        {hint && (
          <span className="font-normal text-muted-foreground/70">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

export function TtsTesterPanel({
  title,
  text,
  initialConfig,
  accent = "border-border",
}: TtsTesterPanelProps) {
  const [config, setConfig] = useState<TtsTestConfig>(initialConfig);
  const [voiceMode, setVoiceMode] = useState<"select" | "manual">("select");
  const [manualVoiceId, setManualVoiceId] = useState("");
  const [metrics, setMetrics] = useState<TtsRunMetrics>(EMPTY_METRICS);
  const [phase, setPhase] = useState<TtsRunPhase>("idle");
  const handleRef = useRef<TtsRunHandle | null>(null);
  const playerRef = useRef<{ player: WebPlayer; bufferSec: number } | null>(
    null,
  );

  useEffect(() => {
    return () => {
      void handleRef.current?.stop();
      handleRef.current = null;
      void playerRef.current?.player.stop();
      playerRef.current = null;
    };
  }, []);

  const getPlayer = (bufferSec: number): WebPlayer => {
    if (!playerRef.current || playerRef.current.bufferSec !== bufferSec) {
      void playerRef.current?.player.stop();
      playerRef.current = {
        player: new WebPlayer({ bufferDuration: bufferSec }),
        bufferSec,
      };
    }
    return playerRef.current.player;
  };

  const set = <K extends keyof TtsTestConfig>(
    key: K,
    value: TtsTestConfig[K],
  ) => setConfig((c) => ({ ...c, [key]: value }));

  const synthesizing = phase === "connecting" || phase === "synthesizing";
  const playing = phase === "playing";
  const paused = phase === "paused";
  const ended = phase === "ended" || phase === "error";

  const effectiveVoiceId =
    voiceMode === "manual" ? manualVoiceId.trim() : config.voiceId;

  const stop = async () => {
    await handleRef.current?.stop();
    handleRef.current = null;
    setPhase("idle");
  };

  const play = async () => {
    if (!effectiveVoiceId) {
      setPhase("error");
      setMetrics({ ...EMPTY_METRICS, error: "No voice id" });
      return;
    }
    // Acquire the player synchronously (within the user gesture) to unlock the
    // AudioContext, THEN fully tear down the previous run so this run's settings
    // always take effect (no stale audio / overlapping context).
    const player = getPlayer(config.playbackBufferSec);
    if (handleRef.current) {
      await handleRef.current.stop();
      handleRef.current = null;
    }
    setMetrics(EMPTY_METRICS);
    setPhase("connecting");

    const runConfig: TtsTestConfig = { ...config, voiceId: effectiveVoiceId };
    try {
      handleRef.current = await runTtsTest(player, runConfig, text, {
        onMetrics: setMetrics,
        onPhase: setPhase,
        onPlaybackEnded: () => {},
      });
    } catch (err) {
      setPhase("error");
      setMetrics((m) => ({
        ...m,
        error: err instanceof Error ? err.message : "Failed to start",
      }));
    }
  };

  const pause = async () => {
    await handleRef.current?.pause();
    setPhase("paused");
  };
  const resume = async () => {
    await handleRef.current?.resume();
    setPhase("playing");
  };

  return (
    <div className={cn("flex flex-col rounded-xl border bg-card p-4", accent)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-1.5">
          {synthesizing ? (
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "connecting" ? "Connecting" : "Synthesizing"}
            </button>
          ) : playing ? (
            <button
              type="button"
              onClick={pause}
              className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-foreground active:bg-accent"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : paused ? (
            <button
              type="button"
              onClick={resume}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground active:bg-primary/90"
            >
              <Play className="h-4 w-4 fill-current" />
              Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={play}
              disabled={!text.trim()}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground active:bg-primary/90 disabled:opacity-50"
            >
              {ended ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {ended ? "Replay" : "Play"}
            </button>
          )}
          {(synthesizing || playing || paused) && (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground active:bg-destructive/80"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Model">
          <select
            className={selectCls}
            value={config.modelId}
            onChange={(e) => set("modelId", e.target.value)}
          >
            {TEST_MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Emotion" hint="normally none">
          <select
            className={selectCls}
            value={config.emotion}
            onChange={(e) => set("emotion", e.target.value)}
          >
            {EMOTION_OPTIONS.map((em) => (
              <option key={em || "none"} value={em}>
                {em || "none"}
              </option>
            ))}
          </select>
        </Field>

        <div className="col-span-2">
          <Field
            label="Voice"
            hint={voiceMode === "manual" ? "manual id" : undefined}
          >
            {voiceMode === "select" ? (
              <select
                className={selectCls}
                value={config.voiceId}
                onChange={(e) => set("voiceId", e.target.value)}
              >
                {TEST_VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={manualVoiceId}
                onChange={(e) => setManualVoiceId(e.target.value)}
                placeholder="Paste a Cartesia voice id…"
                className={selectCls}
              />
            )}
          </Field>
          <button
            type="button"
            onClick={() =>
              setVoiceMode((m) => (m === "select" ? "manual" : "select"))
            }
            className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
          >
            {voiceMode === "select"
              ? "Enter a voice id manually"
              : "Pick from the list"}
          </button>
        </div>

        <Field label="Speed" hint={`${config.speed.toFixed(2)}× (0.6–1.5)`}>
          <Slider
            min={0.6}
            max={1.5}
            step={0.05}
            value={[config.speed]}
            onValueChange={([v]) => set("speed", v)}
            className="w-full"
          />
        </Field>
        <Field label="Volume" hint={`${config.volume.toFixed(2)}× (0.5–2.0)`}>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={[config.volume]}
            onValueChange={([v]) => set("volume", v)}
            className="w-full"
          />
        </Field>

        <div className="col-span-2">
          <Field
            label="Playback buffer (client)"
            hint={`${config.playbackBufferSec.toFixed(2)}s`}
          >
            <Slider
              min={0.05}
              max={2}
              step={0.05}
              value={[config.playbackBufferSec]}
              onValueChange={([v]) => set("playbackBufferSec", v)}
              className="w-full"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field
            label="Server buffering (max_buffer_delay_ms)"
            hint={
              config.maxBufferDelayMs === 0
                ? "custom / immediate"
                : `managed · ${config.maxBufferDelayMs}ms`
            }
          >
            <Slider
              min={0}
              max={3000}
              step={100}
              value={[config.maxBufferDelayMs]}
              onValueChange={([v]) => set("maxBufferDelayMs", v)}
              className="w-full"
            />
          </Field>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
        <Metric label="First audio" value={metrics.firstAudioMs} unit="ms" />
        <Metric label="Total synth" value={metrics.totalMs} unit="ms" />
        <Metric label="Connect" value={metrics.connectMs} unit="ms" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="capitalize">{phase}</span>
        <span>{metrics.chunkCount} chunks</span>
      </div>
      {metrics.error && (
        <p className="mt-1 text-xs text-destructive">{metrics.error}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums text-foreground">
        {value === null ? "—" : `${value}${unit}`}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
