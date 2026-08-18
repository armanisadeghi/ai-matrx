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
  | "audition"
  | "checkup";

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
  audition: "masterwork_audition_verdict",
  checkup: "masterwork_checkup_complete",
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
}: UseMasterworkRunOptions<TResult>): MasterworkRunHandle<TResult> {
  return useDurableRun<TResult>({
    wire: MASTERWORK_RUN_WIRE,
    key: `${surface}:${rulebookId}`,
    path,
    finalEvent: FINAL_EVENT[surface],
    stageLabels: {},
    stageFallback: STAGE_FALLBACK,
    ...(parseResult ? { parseResult } : {}),
    ...(onDomainEvent ? { onDomainEvent } : {}),
    ...(live ? { live } : {}),
  });
}
