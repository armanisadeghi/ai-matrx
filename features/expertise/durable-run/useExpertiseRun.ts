"use client";

/**
 * useExpertiseRun — the expertise FACE of the shared durable-run primitive
 * (`lib/durable-run/useDurableRun.ts`).
 *
 * ## What it closes
 *
 * Compiling a desk and distilling a source both run for minutes. The work was
 * always safe — aidream streams with `detach_on_disconnect=True`, so a compile
 * finishes and drafts land on the pack even if the tab goes away — but the
 * dialogs held the run in an in-tab `await` and had nothing to come back to.
 * "A run that dies on page refresh is the same defect as a spinner."
 *
 * ## What made it possible
 *
 * The expertise pipelines had NO durable run row, which is why the 2026-08-17
 * sweep could not close these two surfaces: there was nothing to remember or
 * rejoin BY, and a client-side substitute would have been a second durability
 * mechanism. aidream now claims a `platform.expertise_run` row before the first
 * AI call, announces its id as the first stream event (`expertise_run`),
 * heartbeats, persists the terminal status/error/result, and serves
 * `POST /expertise-desks/runs/{run_id}/rejoin` — the same shape
 * `seo.collection_run` proved.
 *
 * ## The one wire difference from SEO
 *
 * SEO commands wrap their answer in `data.result`. The expertise pipelines emit
 * TYPED payloads whose event IS the answer (`expertise_ingest_complete` carries
 * `added` / `duplicates_skipped` at the top level). The durable row stores that
 * whole payload, so a snapshot reads `data.result` while the live terminal event
 * reads itself — which is exactly what `resultOf(data, source)` is for.
 */

import type {
  DurableRunHandle,
  DurableRunWire,
} from "@/lib/durable-run/useDurableRun";
import { useDurableRun } from "@/lib/durable-run/useDurableRun";
import type { paths } from "@/types/python-generated/api-types";

export const EXPERTISE_RUN_WIRE: DurableRunWire = {
  pointerPrefix: "matrx.expertise-run.",
  discriminator: "type",
  runStartedEvent: "expertise_run",
  snapshotEvent: "expertise_run_snapshot",
  failedEvent: "expertise_run_failed",
  rejoinPath: "/expertise-desks/runs/{run_id}/rejoin" satisfies keyof paths,
  relation: "platform.expertise_run",
  resultOf: (data, source) => (source === "snapshot" ? data.result : data),
  unfinishedMessage:
    "This run stopped before it finished — nothing was saved. You can start it again.",
};

/**
 * The SURFACE, not the wire operation. `ingest` covers both lanes of the "add
 * rules from a source" dialog (pasted text and an uploaded file) because they
 * are one dialog with one running state and one answer — so they share one
 * pointer, and a reload rejoins whichever lane was going.
 */
export type ExpertiseRunSurface = "compile" | "ingest" | "backtest";

const FINAL_EVENT: Record<ExpertiseRunSurface, string> = {
  compile: "desk_compile_complete",
  ingest: "expertise_ingest_complete",
  backtest: "expertise_backtest_verdict",
};

/**
 * Every expertise pipeline narrates itself with `step` + a human `message` the
 * SERVER wrote for this user. So there is nothing to translate: the stage line
 * IS that message. Anything without one is not a stage and is dropped rather
 * than shown as a raw event name.
 */
const STAGE_FALLBACK = (
  _name: string,
  data: Record<string, unknown>,
): string | null => {
  const message = data.message;
  return typeof message === "string" && message.trim() ? message : null;
};

export interface UseExpertiseRunOptions<TResult> {
  /** Which dialog this is. Decides the terminal event and the pointer. */
  surface: ExpertiseRunSurface;
  /**
   * The pack this run belongs to. It is part of the pointer key, so two packs
   * never rejoin each other's runs, and closing one pack's dialog never
   * resurrects another's.
   */
  packId: string;
  /**
   * The endpoint the NEXT launch will use. Read at launch time, so a dialog
   * that offers two lanes (paste vs upload) just passes whichever its current
   * state selects.
   */
  path: keyof paths;
  /** Narrow/validate the terminal document. Return null to reject it loudly. */
  parseResult?: (raw: unknown) => TResult | null;
}

export type ExpertiseRunHandle<TResult> = DurableRunHandle<TResult>;

export function useExpertiseRun<TResult>({
  surface,
  packId,
  path,
  parseResult,
}: UseExpertiseRunOptions<TResult>): ExpertiseRunHandle<TResult> {
  return useDurableRun<TResult>({
    wire: EXPERTISE_RUN_WIRE,
    key: `${surface}:${packId}`,
    path,
    finalEvent: FINAL_EVENT[surface],
    stageLabels: {},
    stageFallback: STAGE_FALLBACK,
    ...(parseResult ? { parseResult } : {}),
  });
}
