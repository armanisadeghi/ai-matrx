"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { WebPlayer } from "@cartesia/cartesia-js";
import { cn } from "@/lib/utils";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import {
  EMOTION_LEVELS,
  EMOTION_NAMES,
  EMPTY_METRICS,
  emotionTag,
  runTtsTest,
  SPEED_OPTIONS,
  TEST_MODEL_OPTIONS,
  TEST_VOICE_OPTIONS,
  type EmotionLevel,
  type EmotionName,
  type TtsRunHandle,
  type TtsRunMetrics,
  type TtsRunPhase,
  type TtsTestConfig,
} from "./cartesiaTestEngine";

interface TtsTesterPanelProps {
  title: string;
  text: string;
  initialConfig: TtsTestConfig;
  initialCleanMarkdown?: boolean;
  accent?: string;
}

type EmotionLevelChoice = EmotionLevel | "none";

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
  initialCleanMarkdown = true,
  accent = "border-border",
}: TtsTesterPanelProps) {
  const [config, setConfig] = useState<TtsTestConfig>(initialConfig);
  const [voiceMode, setVoiceMode] = useState<"select" | "manual">("select");
  const [manualVoiceId, setManualVoiceId] = useState("");
  const [emotionLevels, setEmotionLevels] = useState<
    Record<EmotionName, EmotionLevelChoice>
  >(() =>
    EMOTION_NAMES.reduce(
      (acc, n) => ({ ...acc, [n]: "none" }),
      {} as Record<EmotionName, EmotionLevelChoice>,
    ),
  );
  const [showEmotions, setShowEmotions] = useState(false);
  const [cleanMarkdown, setCleanMarkdown] = useState(initialCleanMarkdown);
  const [metrics, setMetrics] = useState<TtsRunMetrics>(EMPTY_METRICS);
  const [phase, setPhase] = useState<TtsRunPhase>("idle");
  const handleRef = useRef<TtsRunHandle | null>(null);
  // One player per panel; recreated only when the playback buffer changes, so a
  // long testing session doesn't exhaust the browser's AudioContext budget.
  const playerRef = useRef<{ player: WebPlayer; bufferSec: number } | null>(null);

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

  const set = <K extends keyof TtsTestConfig>(key: K, value: TtsTestConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

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
    // Acquire the player synchronously (within the user gesture) so the browser
    // unlocks the AudioContext, THEN fully tear down the previous run so this
    // run's settings always take effect (no stale audio / overlapping context).
    const player = getPlayer(config.playbackBufferSec);
    if (handleRef.current) {
      await handleRef.current.stop();
      handleRef.current = null;
    }
    setMetrics(EMPTY_METRICS);
    setPhase("connecting");

    const emotions = EMOTION_NAMES.flatMap((name) => {
      const level = emotionLevels[name];
      return level === "none" ? [] : [emotionTag(name, level)];
    });
    const runConfig: TtsTestConfig = {
      ...config,
      voiceId: effectiveVoiceId,
      emotions,
    };
    const spoken = cleanMarkdown ? parseMarkdownToText(text) : text;

    try {
      handleRef.current = await runTtsTest(player, runConfig, spoken || text, {
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
          {/* Primary transport */}
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
          {/* Stop is available whenever a run is active */}
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
        <Field label="Speed (model)">
          <select
            className={selectCls}
            value={config.speed}
            onChange={(e) =>
              set("speed", e.target.value as TtsTestConfig["speed"])
            }
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
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

        <div className="col-span-2">
          <Field
            label="Playback buffer (client)"
            hint={`${config.playbackBufferSec.toFixed(2)}s`}
          >
            <input
              type="range"
              min={0.05}
              max={2}
              step={0.05}
              value={config.playbackBufferSec}
              onChange={(e) => set("playbackBufferSec", Number(e.target.value))}
              className="w-full accent-primary"
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
            <input
              type="range"
              min={0}
              max={3000}
              step={100}
              value={config.maxBufferDelayMs}
              onChange={(e) => set("maxBufferDelayMs", Number(e.target.value))}
              className="w-full accent-primary"
            />
          </Field>
        </div>

        <label className="col-span-2 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={cleanMarkdown}
            onChange={(e) => setCleanMarkdown(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Clean markdown before speaking
        </label>

        {/* Emotions (experimental) */}
        <div className="col-span-2">
          <button
            type="button"
            onClick={() => setShowEmotions((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showEmotions ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Emotions (experimental · Sonic 2-era)
          </button>
          {showEmotions && (
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {EMOTION_NAMES.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs capitalize text-muted-foreground">
                    {name}
                  </span>
                  <select
                    className={selectCls}
                    value={emotionLevels[name]}
                    onChange={(e) =>
                      setEmotionLevels((prev) => ({
                        ...prev,
                        [name]: e.target.value as EmotionLevelChoice,
                      }))
                    }
                  >
                    <option value="none">none</option>
                    {EMOTION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground/70">
                Applied via voice.experimentalControls; Sonic 3+ ignores these.
              </p>
            </div>
          )}
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
