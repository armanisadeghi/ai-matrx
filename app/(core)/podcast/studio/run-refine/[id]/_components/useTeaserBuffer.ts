"use client";

// app/(core)/podcast/studio/run-refine/[id]/_components/useTeaserBuffer.ts
//
// The "don't run out of tricks early" engine for the live wait.
//
// The longest wait is the audio (TTS) step — minutes during which cover art,
// videos, the script preview and stage completions may all arrive in bursts. If
// the UI revealed every arrival at once it would have nothing left to show
// during the long silence that follows. So this hook BUFFERS every real moment
// the run produces into a queue, then drips them out one at a time on a paced
// cadence — turning a burst of arrivals into a steady stream of reveals that
// keeps the user engaged the whole way through.
//
// It is pure presentation: it derives 100% from the real PodcastRunState the
// already-wired useStudioRun owns. It invents NO data — every moment is a real
// generated artifact (a real cover URL, a real script turn, a real stage label).

import { useEffect, useRef, useState } from "react";
import { parseScript, type DialogueTurn } from "@/features/podcasts/generator/script";
import type { PodcastRunState } from "@/features/podcasts/generator/types";

export type TeaserMoment =
  | { id: string; kind: "title"; title: string }
  | { id: string; kind: "description"; text: string }
  | { id: string; kind: "cover"; url: string; index: number; prompt: string }
  | { id: string; kind: "video"; url: string; index: number; prompt: string }
  | {
      id: string;
      kind: "dialogue";
      turns: DialogueTurn[];
      speakers: string[];
    }
  | { id: string; kind: "stage"; label: string };

// How long each revealed moment is featured before the next is pulled from the
// buffer. Tuned so even a fast run (everything arrives in 20s) still has paced
// reveals across the multi-minute audio wait.
const REVEAL_MS = 4200;

interface TeaserBuffer {
  /** The moment currently featured (null only before the first arrival). */
  current: TeaserMoment | null;
  /** How many real moments are still queued behind the current one. */
  queued: number;
  /** Total real moments revealed so far (the "we've shown you N things" count). */
  revealed: number;
}

export function useTeaserBuffer(state: PodcastRunState): TeaserBuffer {
  const queueRef = useRef<TeaserMoment[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  // The rolling window of dialogue turns we've already teased, so each reveal
  // shows the NEXT pair of turns rather than repeating the opening.
  const dialogueCursorRef = useRef(0);

  const [current, setCurrent] = useState<TeaserMoment | null>(null);
  const [queued, setQueued] = useState(0);
  const [revealed, setRevealed] = useState(0);

  // ── Ingest new real moments from state into the buffer (dedup by id) ──────
  const live = parseScript(state.liveText);
  const preview = parseScript(state.scriptPreview);
  const dialogue = live.turns.length > preview.turns.length ? live : preview;

  useEffect(() => {
    const push = (m: TeaserMoment) => {
      if (seenRef.current.has(m.id)) return;
      seenRef.current.add(m.id);
      queueRef.current.push(m);
    };

    if (state.title) push({ id: "title", kind: "title", title: state.title });
    if (state.description)
      push({ id: "description", kind: "description", text: state.description });

    for (const slot of state.images) {
      if (slot.status === "done" && slot.url)
        push({
          id: `cover-${slot.index}`,
          kind: "cover",
          url: slot.url,
          index: slot.index,
          prompt: slot.prompt,
        });
    }
    for (const slot of state.videos) {
      if (slot.status === "done" && slot.url)
        push({
          id: `video-${slot.index}`,
          kind: "video",
          url: slot.url,
          index: slot.index,
          prompt: slot.prompt,
        });
    }

    // Dialogue arrives as a growing list; emit it two turns at a time so the
    // conversation unfolds across several reveals instead of all at once.
    const turns = dialogue.turns;
    while (dialogueCursorRef.current + 1 < turns.length) {
      const start = dialogueCursorRef.current;
      const pair = turns.slice(start, start + 2);
      push({
        id: `dialogue-${start}`,
        kind: "dialogue",
        turns: pair,
        speakers: dialogue.speakers,
      });
      dialogueCursorRef.current = start + 2;
    }

    for (const s of state.stages) {
      if (s.status === "done")
        push({ id: `stage-${s.stage}`, kind: "stage", label: s.label });
    }

    setQueued(queueRef.current.length);
  }, [
    state.title,
    state.description,
    state.images,
    state.videos,
    state.stages,
    dialogue,
  ]);

  // ── Drip one buffered moment at a time on a steady cadence ────────────────
  useEffect(() => {
    const pull = () => {
      const next = queueRef.current.shift();
      if (next) {
        setCurrent(next);
        setRevealed((r) => r + 1);
        setQueued(queueRef.current.length);
      }
    };
    // Pull immediately if we have nothing on screen yet, then on a cadence.
    if (!current && queueRef.current.length > 0) pull();
    const id = setInterval(pull, REVEAL_MS);
    return () => clearInterval(id);
  }, [current]);

  return { current, queued, revealed };
}
