"use client";

/**
 * Kind loading-component gallery — every loader in the hardcoded loading
 * library (features/content-ir/react/loading/), rendered side by side with
 * live early-key controls, so the quality bar of the whole library is
 * judgeable on ONE screen.
 *
 * The "Simulate stream" button replays the early-key arrival order a real
 * stream produces (title → loading_message → subtext → count), so each
 * loader's empty→fed progression is visible, not just its fed state.
 */

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  KIND_LOADING_COMPONENTS,
  KIND_LOADING_SLUGS,
} from "@/features/content-ir/react/loading/kind-loading-registry";
import type { KindLoadingProps } from "@/features/content-ir/react/loading/kind-loading.types";

const FULL_KEYS: KindLoadingProps = {
  title: "Cell Biology Fundamentals",
  description: "A quick check on organelles and energy pathways.",
  loadingMessage: "Crafting your questions…",
  loadingSubtext: "Reading the source material",
  count: 5,
};

/** The staged arrival a real stream produces (ms offsets from play) — the
 * message changes as work progresses and the count STEPS UP as items land,
 * so each loader's reaction to live keys is visible. */
const ARRIVAL: Array<{ at: number; patch: Partial<KindLoadingProps> }> = [
  { at: 0, patch: {} },
  { at: 600, patch: { title: FULL_KEYS.title } },
  { at: 1200, patch: { loadingMessage: "Reading the source material…" } },
  { at: 1900, patch: { count: 1 } },
  {
    at: 2600,
    patch: {
      loadingMessage: FULL_KEYS.loadingMessage,
      loadingSubtext: FULL_KEYS.loadingSubtext,
    },
  },
  { at: 3200, patch: { count: 2 } },
  { at: 3800, patch: { count: 3, description: FULL_KEYS.description } },
  { at: 4400, patch: { count: 4 } },
  { at: 5000, patch: { count: 5, loadingMessage: "Almost there…" } },
];

export default function KindLoaderGallery() {
  const [early, setEarly] = useState<KindLoadingProps>(FULL_KEYS);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const simulate = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setPlaying(true);
    let acc: KindLoadingProps = {};
    setEarly({});
    for (const step of ARRIVAL) {
      timers.current.push(
        setTimeout(() => {
          acc = { ...acc, ...step.patch };
          setEarly(acc);
        }, step.at),
      );
    }
    timers.current.push(
      setTimeout(() => setPlaying(false), ARRIVAL[ARRIVAL.length - 1].at + 400),
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Kind loading library — all {KIND_LOADING_SLUGS.length} loaders
          </h1>
          <p className="text-sm text-muted-foreground">
            Each card is one library slug. Every shape picks exactly one via its
            loading component setting; unknown or missing falls back to{" "}
            <span className="font-medium">generic</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={simulate}
            disabled={playing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Simulate stream (keys arrive one by one)
          </button>
          <button
            type="button"
            onClick={() => setEarly(FULL_KEYS)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            All keys
          </button>
          <button
            type="button"
            onClick={() => setEarly({})}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Bare (no keys yet)
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {KIND_LOADING_SLUGS.map((slug) => {
          const Loader = KIND_LOADING_COMPONENTS[slug];
          return (
            <div
              key={slug}
              className="flex min-h-48 flex-col rounded-lg border border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-foreground">
                  {slug}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  loading_component
                </span>
              </div>
              <div className="flex-1 p-3">
                <Loader kind={slug === "generic" ? undefined : "demo_kind"} {...early} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
