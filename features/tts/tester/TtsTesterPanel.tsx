"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import {
  EMPTY_METRICS,
  runTtsTest,
  SPEED_OPTIONS,
  TEST_MODEL_OPTIONS,
  TEST_VOICE_OPTIONS,
  type TtsRunHandle,
  type TtsRunMetrics,
  type TtsRunPhase,
  type TtsTestConfig,
} from "./cartesiaTestEngine";

interface TtsTesterPanelProps {
  title: string;
  /** The shared transcript from the bench. */
  text: string;
  initialConfig: TtsTestConfig;
  initialCleanMarkdown?: boolean;
  accent?: string;
}

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
        {hint && <span className="font-normal text-muted-foreground/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const selectCls =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary";

export function TtsTesterPanel({
  title,
  text,
  initialConfig,
  initialCleanMarkdown = true,
  accent = "border-border",
}: TtsTesterPanelProps) {
  const [config, setConfig] = useState<TtsTestConfig>(initialConfig);
  const [cleanMarkdown, setCleanMarkdown] = useState(initialCleanMarkdown);
  const [metrics, setMetrics] = useState<TtsRunMetrics>(EMPTY_METRICS);
  const [phase, setPhase] = useState<TtsRunPhase>("idle");
  const handleRef = useRef<TtsRunHandle | null>(null);

  const busy = phase === "connecting" || phase === "synthesizing";
  const active = busy || phase === "playing";

  const set = <K extends keyof TtsTestConfig>(key: K, value: TtsTestConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const stop = async () => {
    await handleRef.current?.stop();
    handleRef.current = null;
    setPhase("idle");
  };

  const play = async () => {
    // Stop any prior run without awaiting, so this call stays in the user's
    // gesture task long enough for the browser to unlock audio.
    void handleRef.current?.stop();
    handleRef.current = null;
    setMetrics(EMPTY_METRICS);
    setPhase("connecting");
    const spoken = cleanMarkdown ? parseMarkdownToText(text) : text;
    try {
      handleRef.current = await runTtsTest(config, spoken || text, {
        onMetrics: setMetrics,
        onPhase: setPhase,
      });
    } catch (err) {
      setPhase("error");
      setMetrics((m) => ({
        ...m,
        error: err instanceof Error ? err.message : "Failed to start",
      }));
    }
  };

  return (
    <div className={cn("flex flex-col rounded-xl border bg-card p-4", accent)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={active ? stop : play}
          disabled={!text.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
            active
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground active:bg-primary/90",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : active ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          {active ? "Stop" : "Play"}
        </button>
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
        <Field label="Speed">
          <select
            className={selectCls}
            value={config.speed}
            onChange={(e) => set("speed", e.target.value as TtsTestConfig["speed"])}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Voice">
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
          </Field>
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
