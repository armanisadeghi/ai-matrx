"use client";

// RC-B7 renderer trial — the SAME content, streamed the same way, through two
// markdown leaves side by side, with the React Profiler timing every commit:
//
//   Current core   — MarkdownStream (splitter → block registry → MarkdownCore:
//                    react-markdown + remend healing + our plugins)
//   Streamdown 2   — Vercel's streaming renderer as the leaf (its own block
//                    memoization + remend), with OUR CodeBlock for fenced code
//
// It changes no default anywhere: this view exists only on /markdown-studio.

import React, { Profiler, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";

const StreamdownLeaf = dynamic(() => import("./StreamdownLeaf"), {
  ssr: false,
});

interface Timing {
  commits: number;
  totalMs: number;
  samples: number[];
}

const EMPTY_TIMING: Timing = { commits: 0, totalMs: 0, samples: [] };

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function TimingRow({ label, timing }: { label: string; timing: Timing }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 text-[11px] tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      <span>{timing.commits} commits</span>
      <span>total {timing.totalMs.toFixed(0)} ms</span>
      <span>p50 {percentile(timing.samples, 50).toFixed(2)} ms</span>
      <span>p95 {percentile(timing.samples, 95).toFixed(2)} ms</span>
      <span>max {percentile(timing.samples, 100).toFixed(2)} ms</span>
    </div>
  );
}

export function RendererTrialView({ content }: { content: string }) {
  const [text, setText] = useState(content);
  const [streaming, setStreaming] = useState(false);
  const [chunkSize, setChunkSize] = useState(24);
  const [coreTiming, setCoreTiming] = useState<Timing>(EMPTY_TIMING);
  const [leafTiming, setLeafTiming] = useState<Timing>(EMPTY_TIMING);
  const coreRef = useRef<Timing>({ ...EMPTY_TIMING, samples: [] });
  const leafRef = useRef<Timing>({ ...EMPTY_TIMING, samples: [] });
  const timer = useRef<number | null>(null);

  // New content (a load, an edit) shows finished until replayed.
  useEffect(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setStreaming(false);
    setText(content);
  }, [content]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setStreaming(false);
    setText(content);
    setCoreTiming({ ...coreRef.current });
    setLeafTiming({ ...leafRef.current });
  };

  const replay = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    coreRef.current = { commits: 0, totalMs: 0, samples: [] };
    leafRef.current = { commits: 0, totalMs: 0, samples: [] };
    setCoreTiming(EMPTY_TIMING);
    setLeafTiming(EMPTY_TIMING);
    let end = 0;
    setText("");
    setStreaming(true);
    timer.current = window.setInterval(() => {
      end = Math.min(content.length, end + chunkSize);
      setText(content.slice(0, end));
      if (end >= content.length) stop();
    }, 16);
  };

  const record =
    (target: React.MutableRefObject<Timing>) =>
    (_id: string, _phase: string, actualDuration: number) => {
      if (!streaming) return;
      target.current.commits += 1;
      target.current.totalMs += actualDuration;
      target.current.samples.push(actualDuration);
    };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          onClick={streaming ? stop : replay}
          disabled={!content}
        >
          {streaming ? (
            <Pause className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {streaming ? "Stop" : "Replay stream"}
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Chunk
          <input
            type="number"
            min={1}
            max={400}
            value={chunkSize}
            onChange={(e) => setChunkSize(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
          />
          chars / 16 ms
        </label>
        <div className="ml-auto flex flex-col gap-0.5">
          <TimingRow label="Current core" timing={coreTiming} />
          <TimingRow label="Streamdown 2" timing={leafTiming} />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="min-h-0 overflow-y-auto border-border p-3 md:border-r">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current core
          </h3>
          <Profiler id="core" onRender={record(coreRef)}>
            <MarkdownStream
              content={text}
              isStreamActive={streaming}
              hideCopyButton
              allowFullScreenEditor={false}
            />
          </Profiler>
        </section>
        <section className="min-h-0 overflow-y-auto p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Streamdown 2 leaf
          </h3>
          <Profiler id="streamdown" onRender={record(leafRef)}>
            <StreamdownLeaf text={text} streaming={streaming} />
          </Profiler>
        </section>
      </div>
    </div>
  );
}
