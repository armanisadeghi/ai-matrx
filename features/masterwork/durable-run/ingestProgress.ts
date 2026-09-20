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

import { humanFailureSentence } from "@/lib/progress/failureSentence";
import type { ProgressStep } from "@/lib/progress/honestSummary";

/** One thing the run was handed, as it is rendered. */
export interface ResourceProgress extends ProgressStep {
  /** Stable across the run — the server's own resource index. */
  id: string;
  /** The second line: what happened to it, in the server's words. */
  detail?: string;
  /**
   * 🚨 WHICH SOURCE THIS ROW IS ABOUT — the same identity the server uses
   * (`aidream/services/distillation/source_identity.py`), so two slots that
   * are the same material can be RECOGNISED as the same material.
   *
   * Null when the event carried nothing to identify it by (a placeholder for
   * a resource that has not reported yet, a `kept_source` row whose identity
   * is its `source_key` and which the progress event does not carry). A row
   * with no identity is never collapsed into another — see
   * `visibleResources`.
   */
  sourceId?: string;
  /**
   * Fold order. Not rendered; it is how `visibleResources` knows which of two
   * reports about ONE source is the later one.
   */
  seq: number;
}

export interface IngestProgress {
  /**
   * A SLOT per resource the server numbered, index-aligned with the payload
   * the client launched. Render `visibleResources(progress)`, never this —
   * two slots can be one source (see `visibleResources`).
   */
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
  /** How many resource reports this state has folded. Fold order, nothing more. */
  seq: number;
}

export const EMPTY_INGEST_PROGRESS: IngestProgress = {
  resources: [],
  chunksDone: 0,
  chunksTotal: null,
  rulesSoFar: -1,
  labouring: null,
  lastProgressAt: null,
  seq: 0,
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
 * THE SOURCE THIS EVENT IS ABOUT, in the server's own identity scheme
 * (`aidream/services/distillation/source_identity.py`): an uploaded file is
 * `file:<id>` whether it arrives as `{token: "file", id}` or as a file lane's
 * own `file_id`, any other entity is `entity:<token>:<id>`, and a URL is
 * itself with only the never-meaningful differences normalised.
 *
 * Null when the event carries nothing to identify by — a `kept_source` row is
 * identified by its `source_key`, which `MasterworkDumpProgressData` does not
 * carry. A null identity NEVER collapses into anything.
 */
function sourceIdOf(data: Record<string, unknown>): string | null {
  const url = str(data.url);
  if (url) return normalizeUrlKey(url);
  const token = str(data.token);
  const id = str(data.id);
  if (token && id) {
    return token.toLowerCase() === "file"
      ? `file:${id}`
      : `entity:${token.toLowerCase()}:${id}`;
  }
  return null;
}

/** `https://EXAMPLE.com/a` and `https://example.com/a/` are one source. */
function normalizeUrlKey(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const parts = value.split("://");
  let normalized = value;
  if (parts.length > 1) {
    const [scheme, ...restParts] = parts;
    const rest = restParts.join("://");
    const slash = rest.indexOf("/");
    const host = slash === -1 ? rest : rest.slice(0, slash);
    const tail = slash === -1 ? "" : rest.slice(slash);
    normalized = `${(scheme ?? "").toLowerCase()}://${host.toLowerCase()}${tail}`;
  }
  if (normalized.endsWith("/") && (normalized.match(/\//g)?.length ?? 0) > 2) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
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
    const index = num(data.resource_index);
    // No resource to key a row off — genuinely nothing to render.
    if (index === null) return state;
    // 🚨 NARROW BY NAME, NEVER BY IGNORANCE. This branch already knows the
    // event is `masterwork_dump_progress` — a resource-shaped event this file
    // is explicitly built to render — so a `step` outside `RESOURCE_STEPS`
    // (a future recovery step, a lane addition nobody taught this table yet)
    // is shown with its RAW label rather than folded away. The 7,412-raw-
    // model-token defect this reducer exists to fix was events this file was
    // never told to render at all; a named resource event it doesn't
    // recognize is a different failure and "nothing fails silently" applies
    // to it too — a person must never see a run's resource list skip a row
    // with no explanation (VERIFICATION.md §19).
    const known = step ? RESOURCE_STEPS[step] : undefined;
    const status = known ?? "waiting";
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
          seq: 0,
        });
      }
    }
    while (resources.length <= index) {
      resources.push({
        id: `resource-${resources.length}`,
        label: `Source ${resources.length + 1}`,
        status: "waiting",
        seq: 0,
      });
    }
    const rawDetail =
      status === "running"
        ? undefined
        : // The server's own sentence wins when it sent one. An unrecognized
          // step with NO message still gets a line — the raw step name — so
          // the row never renders with a state and nothing beside it, which
          // reads as silence about what happened.
          (str(data.message) ?? (known ? undefined : step ?? undefined));
    // 🚨 A RAW EXCEPTION CLASS NAME NEVER REACHES THE ROW. The twelfth cold
    // walk read `failed (AppError). Nothing was added to your Rulebook.` five
    // times; `humanFailureSentence` removes the class name, says out loud when
    // the server named no cause, and always attaches the way out.
    const detail =
      status === "failed" && rawDetail !== undefined
        ? humanFailureSentence(rawDetail).text
        : rawDetail;
    const nextSeq = state.seq + 1;
    const sourceId = sourceIdOf(data);
    resources[index] = {
      id: `resource-${index}`,
      label: labelFor(data, index, count),
      status,
      seq: nextSeq,
      ...(sourceId ? { sourceId } : {}),
      ...(detail ? { detail } : {}),
    };
    const total = num(data.rules_added_total);
    return {
      ...state,
      resources,
      seq: nextSeq,
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
 * 🚨 ONE ROW PER SOURCE. THE SETTLED ONE WINS. A CONTRADICTORY PAIR IS
 * IMPOSSIBLE BY CONSTRUCTION.
 *
 * ## The defect (twelfth cold walk, 2026-09-20, D3)
 *
 * The file-pile panel showed, in one list, at the same moment:
 *
 *   ⚠ 04_field_sheet_photo.png: Reading “04_field_sheet_photo.png” failed …
 *   ✓ 04_field_sheet_photo.png: 3 draft rule(s) added.
 *
 * — thirteen rows for six attached files. Both rows were real: the panel sends
 * the attached file edges AND every kept Source, and a file that has been read
 * once IS a kept Source (`file_ingest.py` claims `file:<id>` before it spends),
 * so the same material was launched twice under two identities and the two
 * attempts genuinely disagreed. The payload-level fix is in
 * `RulebookSourcesPanel.dumpResources`, which now sends one resource per
 * source. This is the render-level backstop for everything that fix cannot
 * reach: a replayed resume event, a lane that stages its own payload, a future
 * server that renumbers.
 *
 * The rule, in one line: among slots that are the SAME source, the LAST report
 * the server made is the truth, and it is the only row shown. A slot with no
 * identity (a placeholder, a `kept_source` whose identity the progress event
 * does not carry) is never collapsed into anything.
 */
export function visibleResources(
  progress: IngestProgress,
): readonly ResourceProgress[] {
  const latestSeqBySource = new Map<string, number>();
  for (const row of progress.resources) {
    if (!row.sourceId) continue;
    const seen = latestSeqBySource.get(row.sourceId);
    if (seen === undefined || row.seq > seen) {
      latestSeqBySource.set(row.sourceId, row.seq);
    }
  }
  const taken = new Set<string>();
  return progress.resources.filter((row) => {
    if (!row.sourceId) return true;
    if (row.seq !== latestSeqBySource.get(row.sourceId)) return false;
    // Two slots reporting the same source in the same fold (structurally
    // impossible today, since `seq` increments per event) still yield one row.
    if (taken.has(row.sourceId)) return false;
    taken.add(row.sourceId);
    return true;
  });
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
  const rows = visibleResources(progress);
  const read = rows.filter((row) => row.status === "completed").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const parts: string[] = [];
  // 🚨 A HEADLINE NEVER COUNTS A FAILURE AS A READ (twelfth cold walk, D2).
  //
  // This line said `${done} of ${total} sources read` where `done` counted
  // `completed` AND `failed` together, so a pile in which five of seven
  // sources died was headed **"7 of 7 sources read"** directly above five rows
  // saying nothing was added. The count was the only number on the screen and
  // it was false. A read and a failure are different outcomes and the headline
  // now says both, in that order.
  if (rows.length > 1) {
    parts.push(
      failed > 0
        ? `${read} of ${rows.length} read · ${failed} failed`
        : `${read} of ${rows.length} sources read`,
    );
  }
  // 🚨 A DENOMINATOR NOBODY CAN COUNT TOWARD IS WORSE THAN NO LINE.
  //
  // The lane announces `chunked` (how many parts a source was split into) at
  // the start, but `ingest.py` emits `chunk_distilled` only AFTER the whole
  // `asyncio.gather` over those parts has returned — so for a single-file run
  // the count goes 0 … 0 … 0 and then straight to the outcome. Verified live
  // 2026-09-17: a finished run that had just added 20 rules still read
  // "0 of 3 parts distilled". That is the motionless screen this file exists
  // to remove, wearing a number. So the clause appears only once the server
  // has actually reported a part finished; until then it says nothing.
  //
  // The real repair is in aidream — per-chunk progress during the gather —
  // and is recorded on board row B4d. This is the honest rendering of the
  // events the server sends TODAY, not a workaround pretending otherwise.
  if (
    progress.chunksTotal !== null &&
    progress.chunksTotal > 0 &&
    progress.chunksDone > 0
  ) {
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
