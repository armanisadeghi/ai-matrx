// features/education/onboard/useKitGeneration.ts
//
// The Study Kit orchestrator: one input → (ingest normalize) → (converter
// fan-out) → live per-target state. This is the engine behind the Upload Hero
// flow. It owns NO generation logic of its own — ingest owns raw→text, the
// converter owns text→artifact. It just sequences them and surfaces progress.

"use client";

import { useCallback, useState } from "react";
import { getGenerator } from "@/features/education/convert";
import type { TargetKind } from "@/features/education/convert";
import { useContentConverter } from "@/features/education/convert";
import { useIngest } from "./useIngest";
import type {
  IngestProgress,
  KitTargetState,
  NormalizedIngest,
  RawIngestInput,
} from "./types";

export type KitPhase = "idle" | "ingesting" | "generating" | "done" | "error";

export interface UseKitGeneration {
  phase: KitPhase;
  /** Live ingest progress line (upload/extract/scrape). */
  ingestProgress: IngestProgress | null;
  /** Per-target live state (pending → running → success/error). */
  targets: KitTargetState[];
  /** The normalized source, once ingest completes. */
  source: NormalizedIngest | null;
  /** Top-level error (ingest failure sinks the whole run). */
  error: string | null;
  busy: boolean;
  /** Run the whole flow. Resolves when every target has settled. */
  run: (
    input: RawIngestInput,
    kinds: TargetKind[],
    options?: { count?: number; difficulty?: string; focus?: string },
  ) => Promise<void>;
  reset: () => void;
}

export function useKitGeneration(): UseKitGeneration {
  const { normalize } = useIngest();
  const { convertMany } = useContentConverter();

  const [phase, setPhase] = useState<KitPhase>("idle");
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
  const [targets, setTargets] = useState<KitTargetState[]>([]);
  const [source, setSource] = useState<NormalizedIngest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setIngestProgress(null);
    setTargets([]);
    setSource(null);
    setError(null);
  }, []);

  const patchTarget = useCallback(
    (kind: TargetKind, patch: Partial<KitTargetState>) => {
      setTargets((prev) =>
        prev.map((t) => (t.targetKind === kind ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const run = useCallback(
    async (
      input: RawIngestInput,
      kinds: TargetKind[],
      options?: { count?: number; difficulty?: string; focus?: string },
    ) => {
      setError(null);
      setSource(null);
      setPhase("ingesting");
      setIngestProgress(null);

      // Seed the target board so the UI can render slots immediately.
      setTargets(
        kinds.map((k) => ({
          targetKind: k,
          label: getGenerator(k)?.label ?? k,
          status: "pending" as const,
        })),
      );

      let normalized: NormalizedIngest;
      try {
        normalized = await normalize(input, setIngestProgress);
        setSource(normalized);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that source.");
        setPhase("error");
        return;
      }

      setPhase("generating");
      setTargets((prev) => prev.map((t) => ({ ...t, status: "running" as const })));

      await convertMany(
        { text: normalized.text, title: normalized.title, ref: normalized.ref },
        kinds,
        options,
        (outcome) => {
          if (outcome.status === "success") {
            const r = outcome.result;
            patchTarget(outcome.targetKind, {
              status: "success",
              href: r.href,
              title: r.title,
              detail: r.detail,
              artifactId: r.artifactId,
              resourceType: r.resourceType,
            });
          } else {
            patchTarget(outcome.targetKind, {
              status: "error",
              error: outcome.error,
            });
          }
        },
        (kind, requestId) => patchTarget(kind, { requestId }),
      );

      setPhase("done");
    },
    [convertMany, normalize, patchTarget],
  );

  return {
    phase,
    ingestProgress,
    targets,
    source,
    error,
    busy: phase === "ingesting" || phase === "generating",
    run,
    reset,
  };
}
