"use client";

/**
 * useMasterworkRun — the Masterwork FACE of the shared durable-run primitive
 * (`lib/durable-run/useDurableRun.ts`).
 *
 * ## What it closes
 *
 * Building a Masterwork and distilling a source both run for minutes. The work
 * was always safe — aidream streams with `detach_on_disconnect=True`, so a
 * Build finishes and drafts land on the Rulebook even if the tab goes away —
 * but the dialogs held the run in an in-tab `await` and had nothing to come
 * back to. "A run that dies on page refresh is the same defect as a spinner."
 *
 * ## What made it possible
 *
 * The Masterwork pipelines had NO durable run row, which is why the 2026-08-17
 * sweep could not close these two surfaces: there was nothing to remember or
 * rejoin BY, and a client-side substitute would have been a second durability
 * mechanism. aidream claims a `platform.masterwork_run` row before the first
 * AI call, announces its id as the first stream event (`masterwork_run`),
 * heartbeats, persists the terminal status/error/result, and serves
 * `POST /masterworks/runs/{run_id}/rejoin` — the same shape
 * `seo.collection_run` proved.
 *
 * ## The one wire difference from SEO
 *
 * SEO commands wrap their answer in `data.result`. The Masterwork pipelines
 * emit TYPED payloads whose event IS the answer (`masterwork_ingest_complete`
 * carries `added` / `duplicates_skipped` at the top level). The durable row
 * stores that whole payload, so a snapshot reads `data.result` while the live
 * terminal event reads itself — which is exactly what `resultOf(data, source)`
 * is for.
 */

import type {
  DurableRunHandle,
  DurableRunWire,
} from "@/lib/durable-run/useDurableRun";
import { useDurableRun } from "@/lib/durable-run/useDurableRun";
import type { paths } from "@/types/python-generated/api-types";

export const MASTERWORK_RUN_WIRE: DurableRunWire = {
  pointerPrefix: "matrx.masterwork-run.",
  discriminator: "type",
  runStartedEvent: "masterwork_run",
  snapshotEvent: "masterwork_run_snapshot",
  failedEvent: "masterwork_run_failed",
  rejoinPath: "/masterworks/runs/{run_id}/rejoin" satisfies keyof paths,
  relation: "platform.masterwork_run",
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
export type MasterworkRunSurface =
  | "build"
  | "ingest"
  | "chat"
  | "dump"
  | "corpus"
  | "timeline"
  | "audition"
  | "audition_unfolding"
  // The BLIND PAIRWISE Audition (`/masterworks/audition-pairwise`) — two of the
  // Expert's own answers judged against each other with no reference. Its own
  // surface and pointer: it never rejoins the reference Audition's dialog.
  | "compare_two"
  | "checkup"
  | "clean_corpus";

const FINAL_EVENT: Record<MasterworkRunSurface, string> = {
  build: "masterwork_build_complete",
  ingest: "masterwork_ingest_complete",
  // The chat-import Approach (`/masterworks/ingest-chat` + the zero-upload
  // `/masterworks/ingest-conversations`) — one dialog, one running state, one
  // pointer; the path picks the lane at launch time.
  chat: "masterwork_ingest_complete",
  // The dump Approach (`/masterworks/ingest-dump`) — its own surface + pointer
  // so a dump never rejoins the single-source ingest dialog or vice versa.
  dump: "masterwork_dump_complete",
  // The "Everything you've published" (body_of_work) Approach
  // (`/masterworks/ingest-corpus`) — its own surface + pointer for the same
  // reason, even though its terminal event type matches the ingest lanes'.
  corpus: "masterwork_ingest_complete",
  // The unfolding TIMELINE Approach (`/masterworks/ingest-timeline`) — a
  // narrative unfolded into a `serial_observation_timeline` and then either
  // distilled (teaching) or sealed (held-out). Its own surface + pointer so a
  // timeline never rejoins the single-source ingest dialog or vice versa,
  // even though its terminal event type matches the other ingest lanes'.
  timeline: "masterwork_ingest_complete",
  audition: "masterwork_audition_verdict",
  // The UNFOLDING audition (mode `unfolding`) — sealed cases worked under the
  // case oracle. Its own surface and pointer: a desk-vs-vanilla case table is
  // not the text-vs-reference verdict, and one dialog tab must never rejoin
  // the other's run.
  audition_unfolding: "masterwork_audition_unfolding_verdict",
  compare_two: "masterwork_pairwise_verdict",
  checkup: "masterwork_checkup_complete",
  // The manual "clean up what I said" pass (`/masterworks/clean-corpus`) — a
  // paid pass the Expert asks for, so it gets its own surface and pointer and
  // is visible in the run ledger like every other Masterwork operation.
  clean_corpus: "masterwork_corpus_cleaned",
};

/**
 * HOW LONG EACH LANE ACTUALLY TAKES — measured, not guessed.
 *
 * Every one of these dialogs used to print the same hardcoded sentence,
 * "Working — this takes a minute." The live ledger says otherwise. Medians over
 * every completed run on `platform.masterwork_run` (read 2026-09-12):
 *
 *   ingest        157s (p90 310s, max 352s)   ← "a minute" was never true
 *   ingest_corpus 156s (p90 272s, max 312s)
 *   ingest_dump    83s (p90 295s, max 402s)
 *   checkup        78s      build 62s
 *   audition       25s      ingest_chat 18s
 *
 * That gap is the whole of the 2026-09-12 "body of work hangs forever" report:
 * corpus item 1a5fd47d read `paulgraham.com/simply.html` in 2m57s and SUCCEEDED
 * with 13 rules, while the screen spent every one of those seconds promising a
 * minute. The person left at ~90s. Nothing had failed.
 *
 * So the promise is now the measurement, and `useDurableRun` stops promising
 * entirely past three times it. Re-measure these when a pipeline changes.
 */
const EXPECTED_MS: Record<MasterworkRunSurface, number> = {
  build: 60_000,
  ingest: 160_000,
  chat: 25_000,
  dump: 90_000,
  corpus: 160_000,
  audition: 30_000,
  // Measured against the reference Audition's single judge call (30s); the
  // faithfulness mode makes TWO, so the promise is doubled rather than guessed
  // downward. Re-measure once this lane has runs of its own on the ledger.
  compare_two: 60_000,
  // The unfolding audition walks a sealed case one disclosure at a time, so it
  // is a multiple of the reference Audition's single judge call rather than a
  // sibling of it. Re-measure once this lane has runs of its own on the ledger.
  audition_unfolding: 120_000,
  // The timeline lane unfolds the narrative and then distils it window by
  // window — the same shape as `ingest`, plus the unfolding call.
  timeline: 180_000,
  checkup: 80_000,
  clean_corpus: 60_000,
};

/**
 * Every Masterwork pipeline narrates itself with `step` + a human `message` the
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

export interface UseMasterworkRunOptions<TResult> {
  /** Which dialog this is. Decides the terminal event and the pointer. */
  surface: MasterworkRunSurface;
  /**
   * The Rulebook this run belongs to. It is part of the pointer key, so two
   * Rulebooks never rejoin each other's runs, and closing one Rulebook's
   * dialog never resurrects another's.
   */
  rulebookId: string;
  /**
   * The endpoint the NEXT launch will use. Read at launch time, so a dialog
   * that offers two lanes (paste vs upload) just passes whichever its current
   * state selects.
   */
  path: keyof paths;
  /** Narrow/validate the terminal document. Return null to reject it loudly. */
  parseResult?: (raw: unknown) => TResult | null;
  /**
   * Override the measured expectation for this surface — only when the SAME
   * surface runs a materially different amount of work (a 200-conversation
   * distillation is not a 3-conversation one). Everything else takes the
   * measured `EXPECTED_MS` and must not hand-write a duration promise.
   */
  expectedMs?: number;
  /**
   * Every domain event as it lands — for a pipeline that answers in PIECES.
   * The Final Checkup streams one finding at a time so the Expert can start
   * deciding while the rest are still being found.
   */
  onDomainEvent?: (
    name: string,
    data: Record<string, unknown>,
    ctx: { rejoin: boolean },
  ) => void;
  /**
   * Adopt the run's stream so the surface can render it through the canonical
   * pipeline. See `DurableRunOptions.live` — pass `surfaceOwnsDisplay` when the
   * surface IS the display for this run's output (the Final Checkup panel).
   */
  live?: {
    label: string;
    instanceId?: string;
    surfaceOwnsDisplay?: boolean;
  };
}

export type MasterworkRunHandle<TResult> = DurableRunHandle<TResult>;

export function useMasterworkRun<TResult>({
  surface,
  rulebookId,
  path,
  parseResult,
  onDomainEvent,
  live,
  expectedMs,
}: UseMasterworkRunOptions<TResult>): MasterworkRunHandle<TResult> {
  return useDurableRun<TResult>({
    wire: MASTERWORK_RUN_WIRE,
    key: `${surface}:${rulebookId}`,
    path,
    expectedMs: expectedMs ?? EXPECTED_MS[surface],
    rejoiningMessage:
      "Picking this back up — it kept working while you were away.",
    finalEvent: FINAL_EVENT[surface],
    stageLabels: {},
    stageFallback: STAGE_FALLBACK,
    ...(parseResult ? { parseResult } : {}),
    ...(onDomainEvent ? { onDomainEvent } : {}),
    ...(live ? { live } : {}),
  });
}
