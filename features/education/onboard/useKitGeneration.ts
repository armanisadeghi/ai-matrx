// features/education/onboard/useKitGeneration.ts
//
// The Study Kit orchestrator: one input → (ingest normalize) → (converter
// fan-out) → live per-target state. This is the engine behind the Upload Hero
// flow. It owns NO generation logic of its own — ingest owns raw→text, the
// converter owns text→artifact. It just sequences them and surfaces progress.

"use client";

import { useCallback, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { getGenerator } from "@/features/education/convert/registry";
import { resolveKitTitle, type KitTitle } from "./kitTitle";
import type {
  ConvertOptions,
  TargetKind,
} from "@/features/education/convert/types";
import { useContentConverter } from "@/features/education/convert/useContentConverter";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
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
  /** Epoch ms the run started — the UI's elapsed clock reads from this. */
  startedAt: number | null;
  /** Epoch ms ingest finished (text in hand); null while still ingesting. */
  ingestFinishedAt: number | null;
  /** Live ingest progress line (upload/extract/scrape). */
  ingestProgress: IngestProgress | null;
  /** Per-target live state (pending → running → success/error). */
  targets: KitTargetState[];
  /** The normalized source, once ingest completes. */
  source: NormalizedIngest | null;
  /**
   * The kit's ONE name, resolved after ingest and carried by every artifact.
   * Null until ingest completes. `named: false` means the namer was unavailable
   * and this is the cleaned-up filename.
   */
  kitTitle: KitTitle | null;
  /** Top-level error (ingest failure sinks the whole run). */
  error: string | null;
  busy: boolean;
  /**
   * Run the whole flow. Resolves true once the document was ingested and every
   * target has settled (so the caller can meter `ingest_document`), false on an
   * empty selection or a failed ingest.
   */
  run: (
    input: RawIngestInput,
    kinds: TargetKind[],
    options?: ConvertOptions,
  ) => Promise<boolean>;
  reset: () => void;
}

export function useKitGeneration(): UseKitGeneration {
  const { normalize } = useIngest();
  const { convertMany } = useContentConverter();
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const [kitTitle, setKitTitle] = useState<KitTitle | null>(null);
  const [phase, setPhase] = useState<KitPhase>("idle");
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
  const [targets, setTargets] = useState<KitTargetState[]>([]);
  const [source, setSource] = useState<NormalizedIngest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [ingestFinishedAt, setIngestFinishedAt] = useState<number | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setKitTitle(null);
    setIngestProgress(null);
    setTargets([]);
    setSource(null);
    setError(null);
    setStartedAt(null);
    setIngestFinishedAt(null);
  }, []);

  const patchTarget = useCallback(
    (kind: TargetKind, patch: Partial<KitTargetState>) => {
      setTargets((prev) =>
        prev.map((t) => (t.targetKind === kind ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  // Returns true once the document was ingested and the kit fan-out ran (phase
  // → done). The caller meters `ingest_document` on that success; an empty
  // selection or a failed ingest returns false and never burns quota.
  const run = useCallback(
    async (
      input: RawIngestInput,
      kinds: TargetKind[],
      options?: ConvertOptions,
    ): Promise<boolean> => {
      if (kinds.length === 0) {
        setError("Pick at least one thing to create.");
        setPhase("error");
        return false;
      }
      setError(null);
      setSource(null);
      setKitTitle(null);
      setPhase("ingesting");
      setIngestProgress(null);
      setStartedAt(Date.now());
      setIngestFinishedAt(null);

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
        setIngestFinishedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that source.");
        setPhase("error");
        return false;
      }

      // NAME THE KIT ONCE, here, between ingest and fan-out. Every generator
      // resolves its own title from `source.title`, and on a multi-section run
      // `source.title` WINS over the agent's title — so this single value is
      // what all eight artifacts end up called. Best-effort by construction:
      // `resolveKitTitle` never throws and always returns a usable name.
      //
      // 🚨 The org is resolved HERE, the same way `convertMany` resolves it for
      // every generator (`ensureOrgId`). Without it the namer launches with no
      // organization and, for a learner who has never touched the org picker —
      // i.e. exactly the new user whose filenames are the messiest — the run
      // throws before any network call and the kit silently falls back to the
      // humanized filename. The AI namer would have been dead code for the
      // whole audience it exists to serve.
      const orgId = await ensureOrgId(undefined);
      const resolvedTitle = await resolveKitTitle(dispatch, store, {
        text: normalized.text,
        rawTitle: normalized.title,
        focus: options?.focus,
        orgId,
      });
      setKitTitle(resolvedTitle);

      setPhase("generating");
      const generationStartedAt = Date.now();
      setTargets((prev) =>
        prev.map((t) => ({
          ...t,
          status: "running" as const,
          startedAt: generationStartedAt,
        })),
      );

      await convertMany(
        {
          text: normalized.text,
          // THE kit name — not the raw filename. Every generator reads this.
          title: resolvedTitle.title,
          ref: normalized.ref,
        },
        kinds,
        options,
        (outcome) => {
          if (outcome.status === "success") {
            const r = outcome.result;
            patchTarget(outcome.targetKind, {
              status: "success",
              finishedAt: Date.now(),
              href: r.href,
              title: r.title,
              detail: r.detail,
              artifactId: r.artifactId,
              resourceType: r.resourceType,
              stillGenerating: r.pending === true,
            });
          } else {
            patchTarget(outcome.targetKind, {
              status: "error",
              finishedAt: Date.now(),
              error: outcome.error,
            });
          }
        },
        (kind, requestId) => patchTarget(kind, { requestId }),
        (kind, progress) => patchTarget(kind, { coverage: progress }),
      );

      setPhase("done");
      return true;
    },
    [convertMany, normalize, patchTarget, dispatch, store],
  );

  return {
    phase,
    startedAt,
    ingestFinishedAt,
    ingestProgress,
    targets,
    source,
    kitTitle,
    error,
    busy: phase === "ingesting" || phase === "generating",
    run,
    reset,
  };
}
