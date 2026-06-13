"use client";

/**
 * Mermaid playground (dev demo) — exercises the components/mermaid core without
 * the chat pipeline: a live editor, the streaming-simulation last-good
 * behavior, and the per-type catalog gallery.
 */

import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";

import { MermaidRenderer } from "@/components/mermaid/MermaidRenderer";
import MermaidBlock from "@/components/mardown-display/blocks/mermaid/MermaidBlock";
import { getFeaturedCatalogEntries, MERMAID_CATALOG } from "@/components/mermaid/catalog";
import { detectDiagramType } from "@/components/mermaid/diagram-type";
import type { MermaidRenderOptions } from "@/components/mermaid/types";
import { Button } from "@/components/ui/button";

const DEFAULT_OPTIONS: MermaidRenderOptions = { theme: "default", look: "classic", layout: "dagre" };

const BROKEN_SAMPLE = `flowchart TD
  A[Validate (strict) mode] -> B{ok?}
  B -->|Yes| end
  B -->|No| A
  // retry path`;

export default function MermaidPlaygroundPage() {
  const featured = getFeaturedCatalogEntries();
  const [source, setSource] = useState(MERMAID_CATALOG.flowchart.starterTemplate);
  const [theme, setTheme] = useState<MermaidRenderOptions["theme"]>("default");
  const [look, setLook] = useState<MermaidRenderOptions["look"]>("classic");

  const options: MermaidRenderOptions = { theme, look, layout: "dagre" };
  const detected = detectDiagramType(source);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Mermaid Playground</h1>
        <p className="text-sm text-muted-foreground">
          Exercises the <code>components/mermaid</code> renderer, the forgiving sanitizer, and the
          streaming last-good behavior. Detected type:{" "}
          <span className="font-medium text-foreground">{detected}</span>
        </p>
      </header>

      {/* Chat block — the real MermaidBlock with its full header toolbar
          (style / export / copy / source / fullscreen / edit). */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Chat block (full toolbar)</h2>
        <MermaidBlock content={MERMAID_CATALOG.flowchart.starterTemplate} />
        <p className="text-xs text-muted-foreground">
          The Expand icon in the header opens the diagram fullscreen (Esc to exit).
        </p>
      </section>

      {/* Live editor */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Live editor</h2>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              Theme
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as MermaidRenderOptions["theme"])}
                className="rounded border border-border bg-card px-1 py-0.5"
              >
                {["default", "dark", "forest", "neutral", "base"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Look
              <select
                value={look}
                onChange={(e) => setLook(e.target.value as MermaidRenderOptions["look"])}
                className="rounded border border-border bg-card px-1 py-0.5"
              >
                <option value="classic">classic</option>
                <option value="handDrawn">handDrawn</option>
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={() => setSource(BROKEN_SAMPLE)}>
              Load broken sample
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="h-80 w-full resize-none rounded-md border border-border bg-card p-3 font-mono text-xs"
          />
          <div className="min-h-80 rounded-md border border-border bg-textured p-2">
            <MermaidRenderer source={source} options={options} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Try the broken sample — the sanitizer auto-fixes the <code>-&gt;</code> arrows, the reserved{" "}
          <code>end</code> node, the unquoted <code>( )</code> label, and the <code>{"//"}</code> comment, and
          logs <code>[MermaidSanitize] RECOVERED</code> to the console.
        </p>
      </section>

      {/* Streaming simulation */}
      <StreamingSimulation />

      {/* Catalog gallery */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Catalog ({featured.length} featured types)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((entry) => (
            <button
              key={entry.type}
              type="button"
              onClick={() => setSource(entry.starterTemplate)}
              className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <entry.icon className="h-4 w-4 text-primary" />
                {entry.label}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {entry.support === "full" ? "editable" : "code"}
                </span>
              </span>
              <div className="h-40 overflow-hidden rounded border border-border/50 bg-textured p-1">
                <MermaidRenderer source={entry.starterTemplate} options={DEFAULT_OPTIONS} hideViewportControls />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StreamingSimulation() {
  const full = MERMAID_CATALOG.flowchart.starterTemplate;
  const [streamed, setStreamed] = useState("");
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    stop();
    setStreamed("");
    setRunning(true);
    let i = 0;
    timer.current = setInterval(() => {
      i += 4;
      setStreamed(full.slice(0, i));
      if (i >= full.length) {
        stop();
      }
    }, 60);
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };
  useEffect(() => () => stop(), []);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Streaming simulation</h2>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={start} disabled={running} className="gap-1">
            <Play className="h-3.5 w-3.5" /> Stream
          </Button>
          <Button size="sm" variant="outline" onClick={stop} disabled={!running} className="gap-1">
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStreamed(full)} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Complete
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <pre className="h-48 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-muted-foreground">
          {streamed || "Press Stream to feed the diagram in character-by-character"}
        </pre>
        <div className="min-h-48 rounded-md border border-border bg-textured p-2">
          <MermaidRenderer source={streamed} options={DEFAULT_OPTIONS} isStreamActive={running} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        While streaming, the renderer keeps the last good diagram and never flashes an error on a
        half-arrived fence — it only renders once each partial validates.
      </p>
    </section>
  );
}
