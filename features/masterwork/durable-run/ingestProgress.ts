// features/masterwork/durable-run/ingestProgress.ts
//
// 🚨 THE EVENTS THE SERVER DOES EMIT REACH THE SCREEN AS STATE, NOT AS PROSE.
//
// ## The defect (acquisition-frontier §7.3, 2026-09-17)
//
// A paid, correct, 8-minute ingest looked frozen. Measured on the 151.5s
// reproduction of the same lane: **7,412 of 7,414 stream events were raw model
// tokens the dialog does not render.** The two it did render were the two
// typed progress events at either end. Between `resource_started` and
// `resource_done` the screen showed one identical sentence for minutes, under
// a spinner, beside an estimate that had been overtaken four times over — so
// an independent verifier stopped at 2m40s and reported the system broken.
//
// ## What is actually knowable, and therefore owed
//
// The lanes DO emit typed progress, and every one of these fields was already
// arriving and being thrown away — `run.stages` kept only `data.message`, a
// flat list of strings with no structure to render states from:
//
//   `masterwork_dump_progress` — `step` (resource_started | resource_done |
//     resource_failed | resource_unsupported | resource_already_distilled),
//     `resource_index`, `resource_count`, `title`/`url`/`kind`,
//     `rules_added`, `rules_added_total`
//   `masterwork_ingest_progress` — `step` (chunked | chunk_distilled |
//     chunk_failed | verified | …), `chunk_index`, `total_chunks`,
//     `rules_found`
//   `masterwork_run_labouring` — the server's OWN sentence for a beat that
//     cannot reach the database (aidream 513ad71c3d). It exists precisely so a
//     screen shows a fact instead of a spinner while the server is busy.
//
// So this file is the reducer: events in, a rendered shape out — a row per
// resource with a state, a chunk count, a running rule total, and the
// labouring sentence while it applies. It is pure and has no React in it, so
// the guard can drive it with a real event transcript.
//
// It deliberately renders NO fraction of its own invention. `chunksDone /
// chunksTotal` is a count the server sent; nothing here computes a percentage
// of a run, because nothing here knows one.

import type { ProgressStep } from "@/lib/progress/honestSummary";

/** One thing the run was handed, as it is rendered. */
export interface ResourceProgress extends ProgressStep {
  /** Stable across the run — the server's own resource index. */
  id: string;
  /** The second line: what happened to it, in the server's words. */
  detail?: string;
}

export interface IngestProgress {
  /** A row per resource, in the order the server numbered them. */
  resources: ResourceProgress[];
  /** Chunks of the source being read right now, when the lane said so. */
  chunksDone: number;
  chunksTotal: number | null;
  /** Draft rules the server has reported so far. -1 means "not yet reported". */
  rulesSoFar: number;
  /**
   * THE SERVER'S OWN SENTENCE for a run whose heartbeat cannot land. Non-null
   * only between a `masterwork_run_labouring` event and the next real piece of
   * progress — a screen that kept it after work resumed would be its own lie.
   */
  labouring: string | null;
  /**
   * When the last TYPED progress event arrived, epoch ms. Null before the
   * first. The client's own `last_progress_ts`: it is what lets a surface say
   * how long it has been since anything actually moved, rather than how long
   * the run has been alive.
   */
  lastProgressAt: number | null;
}

export const EMPTY_INGEST_PROGRESS: IngestProgress = {
  resources: [],
  chunksDone: 0,
  chunksTotal: null,
  rulesSoFar: -1,
  labouring: null,
  lastProgressAt: null,
};

/** The dump lane's per-resource steps, mapped to the state each one means. */
const RESOURCE_STEPS: Record<string, ProgressStep["status"]> = {
  resource_started: "running",
  resource_done: "completed",
  resource_already_distilled: "completed",
  resource_failed: "failed",
  resource_unsupported: "failed",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * What to call a resource on screen. The server resolves the real title
 * through the same reader the ingest uses, so prefer it; a URL is its own
 * name; and the honest fallback names the position rather than printing a raw
 * entity token at a non-technical Expert.
 */
function labelFor(data: Record<string, unknown>, index: number, count: number | null): string {
  return (
    str(data.title) ??
    str(data.url) ??
    `Source ${index + 1}${count ? ` of ${count}` : ""}`
  );
}

/**
 * Fold ONE stream event into the rendered progress. Unknown events return the
 * state unchanged (identity), so a lane may hand every domain event straight
 * through without deciding what this file cares about.
 */
export function reduceIngestProgress(
  state: IngestProgress,
  name: string,
  data: Record<string, unknown>,
  now: number = Date.now(),
): IngestProgress {
  if (name === "masterwork_run_labouring") {
    const message = str(data.message);
    // No sentence, no notice — this file never writes the server's copy for it.
    return message ? { ...state, labouring: message } : state;
  }

  if (name === "masterwork_dump_progress") {
    const step = str(data.step);
    const status = step ? RESOURCE_STEPS[step] : undefined;
    const index = num(data.resource_index);
    if (!status || index === null) return state;
    const count = num(data.resource_count);
    const resources = state.resources.slice();
    // Every resource the server numbered exists on screen from the first
    // event, waiting — a list that grows one row at a time hides the size of
    // what is still to come, which is the question a person waiting has.
    if (count !== null) {
      while (resources.length < count) {
        resources.push({
          id: `resource-${resources.length}`,
          label: `Source ${resources.length + 1} of ${count}`,
          status: "waiting",
        });
      }
    }
    while (resources.length <= index) {
      resources.push({
        id: `resource-${resources.length}`,
        label: `Source ${resources.length + 1}`,
        status: "waiting",
      });
    }
    const detail =
      status === "running" ? undefined : (str(data.message) ?? undefined);
    resources[index] = {
      id: `resource-${index}`,
      label: labelFor(data, index, count),
      status,
      ...(detail ? { detail } : {}),
    };
    const total = num(data.rules_added_total);
    return {
      ...state,
      resources,
      rulesSoFar: total !== null ? total : state.rulesSoFar,
      // Work landed, so the server is plainly reaching us again.
      labouring: null,
      lastProgressAt: now,
      // A new resource starts its own chunk count; the old one is finished.
      ...(status === "running" ? { chunksDone: 0, chunksTotal: null } : {}),
    };
  }

  if (name === "masterwork_ingest_progress") {
    const step = str(data.step);
    const totalChunks = num(data.total_chunks);
    const chunkIndex = num(data.chunk_index);
    const found = num(data.rules_found);
    let chunksDone = state.chunksDone;
    if (step === "chunked") chunksDone = 0;
    if (
      (step === "chunk_distilled" || step === "chunk_failed") &&
      chunkIndex !== null
    ) {
      chunksDone = Math.max(chunksDone, chunkIndex + 1);
    }
    return {
      ...state,
      chunksDone,
      chunksTotal: totalChunks ?? state.chunksTotal,
      rulesSoFar:
        found !== null
          ? Math.max(state.rulesSoFar, 0) + found
          : state.rulesSoFar,
      labouring: null,
      lastProgressAt: now,
    };
  }

  return state;
}

/**
 * How long it has been since anything MOVED, in ms — as distinct from how long
 * the run has been alive. Null when nothing has moved yet.
 */
export function sinceLastProgressMs(
  progress: IngestProgress,
  now: number = Date.now(),
): number | null {
  return progress.lastProgressAt === null
    ? null
    : Math.max(0, now - progress.lastProgressAt);
}

/**
 * The one line that says where the run is, built ONLY from counts the server
 * sent. Null when the server has not said enough to make a true sentence.
 */
export function progressHeadline(progress: IngestProgress): string | null {
  const done = progress.resources.filter(
    (row) => row.status === "completed" || row.status === "failed",
  ).length;
  const parts: string[] = [];
  if (progress.resources.length > 1) {
    parts.push(`${done} of ${progress.resources.length} sources read`);
  }
  if (progress.chunksTotal !== null && progress.chunksTotal > 0) {
    parts.push(
      `${Math.min(progress.chunksDone, progress.chunksTotal)} of ${progress.chunksTotal} parts distilled`,
    );
  }
  if (progress.rulesSoFar >= 0) {
    parts.push(
      `${progress.rulesSoFar} draft ${progress.rulesSoFar === 1 ? "rule" : "rules"} so far`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
