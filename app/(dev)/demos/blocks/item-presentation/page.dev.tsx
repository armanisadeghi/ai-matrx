"use client";

/**
 * Item Presentation playground (dev demo) — exercises the
 * features/item-presentation render block directly (no chat pipeline): the
 * instant skeleton, recognized-type styling, DB auto-enrichment, the grow-in
 * details, the neutral fallback for unknown types, and a streaming simulation
 * that types the JSON out character-by-character.
 */

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Play, Square, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

const ItemPresentationBlock = dynamic(
  () => import("@/features/item-presentation/ItemPresentationBlock"),
  { ssr: false },
);

// The agent example from the spec — a real agent id so it enriches live.
const AGENT_SAMPLE = `{
  "item_presentation": {
    "id": "1f8b1100-5fbf-4074-ac91-64cbb30e7d8b",
    "type": "agent",
    "name": "Project Copilot",
    "about": "Agentic PM assistant: plans work, edits tasks & notes, builds checklists, searches the web and your own docs."
  }
}`;

// Recognized types with agent-provided fields but non-existent ids — proves the
// card looks great on the model's data alone (enrichment soft-fails to not-found).
const SAMPLES: { title: string; json: string }[] = [
  { title: "Agent (live enrichment)", json: AGENT_SAMPLE },
  {
    title: "Note",
    json: `{"item_presentation":{"id":"00000000-0000-0000-0000-000000000001","type":"note","name":"Q3 Planning Notes","about":"Rough outline for the quarterly planning session."}}`,
  },
  {
    title: "Task",
    json: `{"item_presentation":{"id":"00000000-0000-0000-0000-000000000002","type":"task","name":"Ship the onboarding flow","about":"Wire the new welcome screen + first-run checklist."}}`,
  },
  {
    title: "Project",
    json: `{"item_presentation":{"id":"00000000-0000-0000-0000-000000000003","type":"project","name":"Atlas","about":"The next-gen workspace initiative."}}`,
  },
  {
    title: "File (image)",
    json: `{"item_presentation":{"id":"00000000-0000-0000-0000-000000000004","type":"image","name":"hero-banner.png","about":"Marketing hero image, 2400×1200."}}`,
  },
  {
    title: "Minimal (type + id only)",
    json: `{"item_presentation":{"id":"00000000-0000-0000-0000-000000000005","type":"scope"}}`,
  },
  {
    title: "Unknown type → neutral fallback",
    json: `{"item_presentation":{"id":"x","type":"spaceship","name":"USS Enterprise","about":"A type our registry has never heard of — still renders cleanly."}}`,
  },
];

function StreamingSim() {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };

  const start = () => {
    stop();
    setText("");
    setRunning(true);
    let i = 0;
    timer.current = setInterval(() => {
      i += 3;
      setText(AGENT_SAMPLE.slice(0, i));
      if (i >= AGENT_SAMPLE.length) stop();
    }, 40);
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" onClick={start} disabled={running}>
          <Play className="mr-1.5 h-3.5 w-3.5" /> Simulate stream
        </Button>
        <Button size="sm" variant="outline" onClick={stop} disabled={!running}>
          <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            stop();
            setText("");
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
      <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
        {text || "(idle)"}
      </pre>
      {text && (
        <ItemPresentationBlock content={text} isStreamActive={running} />
      )}
    </div>
  );
}

export default function ItemPresentationPlaygroundPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">
          Item Presentation — render block
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A tiny <code>{`{ id, type, name, about }`}</code> payload becomes a
          clickable card that auto-enriches from the database and opens the
          matching window panel on click. Recognized types get a custom icon +
          accent; unknown types fall back gracefully.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">
          Streaming (instant skeleton → enriched card)
        </h2>
        <StreamingSim />
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Gallery</h2>
        {SAMPLES.map((s) => (
          <div key={s.title} className="space-y-1">
            <div className="pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {s.title}
            </div>
            <ItemPresentationBlock content={s.json} />
          </div>
        ))}
      </section>
    </div>
  );
}
