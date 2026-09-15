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
  // A deploy releases the run mid-stream rather than killing it silently —
  // the recovery sweep re-queues the row, so this is a fact to relay, never a
  // failure. See `RESUMING_AFTER_RESTART_MESSAGE`.
  drainingEvent: "masterwork_run_draining",
  rejoinPath: "/masterworks/runs/{run_id}/rejoin" satisfies keyof paths,
  // Cancel MEANS cancel here (aidream `POST /masterworks/runs/{run_id}/cancel`):
  // the durable row goes terminal with the person's reason and the worker stops
  // at its next chunk. Before this endpoint existed the dialogs' Cancel could
  // only close the dialog while the work — and the spend — carried on.
  cancelPath: "/masterworks/runs/{run_id}/cancel" satisfies keyof paths,
  cancelledEvent: "masterwork_run_cancelled",
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
  // The UNFOLDING lane (`/masterworks/ingest-unfolding`) — a SEPARATE
  // surface from `timeline`, and the separation is load-bearing. Two
  // trials built a case lane at the same time: trial 8's lives in the
  // source dialog on `/masterworks/ingest-timeline`, trial 7's in its own
  // dialog on `/masterworks/ingest-unfolding`, and they parse their
  // results with DIFFERENT parsers. While both declared `timeline` they
  // shared one pointer key (`${surface}:${rulebookId}`), so a reload could
  // rejoin an unfolding run inside the source dialog — wrong parser, and
  // no seal-and-strip on a HELD-OUT case, which is the one run whose
  // resolution must never reach the screen (Bugbot, 2026-09-13).
  | "unfolding"
  | "triage"
  | "audition"
  | "audition_unfolding"
  // The BLIND PAIRWISE Audition (`/masterworks/audition-pairwise`) — two of the
  // Expert's own answers judged against each other with no reference. Its own
  // surface and pointer: it never rejoins the reference Audition's dialog.
  | "compare_two"
  | "checkup"
  | "clean_corpus"
  // THE PREDICTION LEDGER (`/masterworks/ingest-predictions`) — the Expert's
  // own resolved calls on real open cases, distilled into rules from the WHYS
  // behind the ones she called right and boundary findings from the ones she
  // did not. Its own surface + pointer: a ledger distillation is not a source
  // ingest, and a reload must never rejoin one as the other.
  | "prediction"
  // THE RED-PEN LANE (`/masterworks/ingest-markup`) — a piece of somebody
  // else's work the Expert marked up, correction by correction. Its own
  // surface + pointer: a review is not a source ingest, and a reload must
  // never rejoin one as the other.
  | "red_pen"
  // THE BAD EXAMPLE PROBE (`/masterworks/probe`) — one round: distil what the
  // Expert said was wrong with the last plausible-but-wrong example, then
  // write the next one. Its own surface + pointer, and its own terminal event,
  // because a probe round's answer is a NEW QUESTION as well as a rule count.
  | "probe"
  // SHADOW-THE-INBOX (`/masterworks/ingest-inbox`) — the Expert's real mail,
  // diffed against a blind generic reply. Its own surface + pointer: it is not
  // a source ingest and must never rejoin one, and its run makes TWO paid calls
  // per thread rather than one.
  | "shadow_inbox"
  // THE TEACH-BACK (`/masterworks/teach-back`) — one round: distil the Expert's
  // correction of the last explanation we gave back to them, then say it again
  // with that correction in it. Its own surface + pointer, and its own terminal
  // event, because a teach-back round's answer is a NEW QUESTION as well as a
  // rule count — a rejoin that settled on an ingest summary would leave the
  // Expert with nothing on screen to interrupt.
  | "teach_back"
  // THE MEETING SCAVENGER (`/masterworks/ingest-meeting`) — the meetings the
  // Expert already has, mined for the moments THEY made a call. Its own
  // surface + pointer: a meeting scavenge is not a chat import and a reload
  // must never rejoin one as the other.
  | "meeting"
  // THE TRIAL BENCH (`/masterworks/{rulebook_id}/bench/runs`) — six arms, a
  // blind panel, and a verdict. Its own surface and pointer: a Bench trial is
  // not an Audition and must never rejoin one.
  //
  // 🚨 A BENCH RUN IS NOT ALWAYS DURABLE. `bench_trial` is not yet in the
  // `platform.masterwork_run.operation` vocabulary, so when the server reports
  // `form.durable === false` there is no row, no `masterwork_run` receipt and
  // therefore no pointer and no rejoin. That degrades cleanly here — `launch`
  // sets `running` itself, stages and the terminal event are handled without a
  // run id — and the DOOR says so in the server's own sentence before the
  // person spends. It is never papered over.
  | "bench"
  // THE DAILY DRIP (`/masterworks/ingest-drip`) — a run of one-question-a-day
  // answers, each anchored to the morning it was asked. Its own surface +
  // pointer: a drip distillation is not a source ingest, and a reload must
  // never rejoin one as the other.
  | "drip";

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
  // narrative unfolded into a `serial_observation_timeline`, chunked by STEP,
  // and then either distilled (teaching) or sealed (held-out). Its own surface
  // + pointer so a timeline never rejoins the single-source ingest dialog or
  // vice versa, even though its terminal event type matches the other ingest
  // lanes'.
  timeline: "masterwork_ingest_complete",
  // The UNFOLDING lane (`/masterworks/ingest-unfolding`) — the same
  // terminal event as the other ingest lanes, its own surface + pointer so
  // it can never rejoin the source dialog's timeline lane.
  unfolding: "masterwork_ingest_complete",
  // Sorting the DRAFT pile by what the Rulebook is FOR
  // (`/masterworks/triage`, W59 + W61). Its own surface + pointer: a triage is
  // not an ingest, and a reload must never rejoin one as the other.
  triage: "masterwork_triage_complete",
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
  // The prediction-ledger lane appends draft rules exactly as the other
  // ingest lanes do, so it shares their terminal event — and nothing else.
  prediction: "masterwork_ingest_complete",
  // The Daily Drip appends draft rules exactly as the other ingest lanes do,
  // so it shares their terminal event — but never their pointer.
  drip: "masterwork_ingest_complete",
  // The red-pen lane appends draft rules exactly as the other ingest lanes
  // do, so it shares their terminal event — and nothing else.
  red_pen: "masterwork_ingest_complete",
  // The probe is the one lane whose terminal payload is not an ingest summary:
  // it carries the next bad example as well as what the last answer produced.
  probe: "masterwork_probe_round",
  // The teach-back is the probe's sibling in this one respect: its terminal
  // payload carries the next explanation, not an ingest summary.
  teach_back: "masterwork_teach_back_round",
  // Shadow-the-inbox appends draft rules exactly as the other ingest lanes do,
  // so it shares their terminal event — and nothing else.
  shadow_inbox: "masterwork_ingest_complete",
  // The Meeting Scavenger (`/masterworks/ingest-meeting`) — same terminal
  // event as every ingest lane, its own surface so the pointers never cross.
  meeting: "masterwork_ingest_complete",
  bench: "masterwork_bench_verdict",
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
  // THE DAILY DRIP distils ONE batch of short answers in a single mandate
  // call — a run of days is an atom, so there is no per-chunk multiplier. It
  // sits below `ingest` because the whole corpus is a handful of paragraphs
  // rather than a document. Estimated until this lane has runs of its own on
  // the ledger; re-measure then, as the header of this table requires.
  drip: 45_000,
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
  checkup: 80_000,
  clean_corpus: 60_000,
  // The timeline lane unfolds the narrative and then distils it window by
  // window — the same shape as `ingest`, plus the unfolding call. Estimated at
  // 180 s until it had runs of its own; MEASURED since (Trial 8, 2026-09-12):
  // 56 timeline ingests (one case each) ran 31–103 s, median ~60 s. The
  // measurement wins, as the header of this table says it must.
  timeline: 90_000,
  // The unfolding lane does the same work as `timeline` plus the sealing
  // and window pass, and has no runs of its own on the ledger yet, so it
  // inherits the measured timeline figure rather than a guess. Re-measure
  // once it has runs of its own, as the header of this table requires.
  unfolding: 90_000,
  // Trial 8, 2026-09-12: the two live triage passes of ~900 drafts took 89 s.
  triage: 90_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. It distils a handful of one-line reasons rather than a
  // whole document, so it opens on the measured `chat` figure (25 s) doubled
  // rather than on a source ingest's 160 s.
  prediction: 50_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. It distils a handful of short corrections rather than a
  // whole document, in one or two batches, so it opens on the prediction
  // lane's figure rather than on a source ingest's 160 s.
  red_pen: 50_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. One round is TWO paid calls in sequence: distilling a
  // short spoken critique (the measured `chat` shape, ~25 s) and then writing
  // a whole work product with a reasoning model (nearer a build's 60 s).
  probe: 90_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. Per thread it makes TWO paid calls in sequence: a
  // generalist drafting one email blind (shorter than a `chat` distillation,
  // ~20 s) and then the transcript distiller reading the correction log (the
  // measured `chat` shape, ~25 s). Threads run concurrently, so the promise is
  // the serial depth of one thread plus headroom, not a multiple of the count.
  shadow_inbox: 60_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. One round is at most TWO paid calls in sequence: distilling
  // a short spoken correction (the measured `chat` shape, ~25 s) and then
  // writing about 150 words of plain speech from a Rulebook briefing (a short
  // reasoning call, nearer 30 s). Round one is the second of those alone.
  teach_back: 55_000,
  // The scavenger reads one portion per meeting-sized batch of the Expert's own
  // turns — far less text than a source ingest, and a single paid call for most
  // meetings. Seeded at the chat lane's measured median until this lane has
  // runs of its own on `platform.masterwork_run`; re-measure then.
  meeting: 40_000,
  // ESTIMATE, not a measurement — this lane has no runs of its own on the
  // ledger yet, and the header of this table demands it be re-measured the
  // moment it does. A trial runs SIX arms (A0/A1/A2/B/C/GT), one of which is
  // the product's own workflow, and then judges them: a spine call per arm,
  // the panel's calibration leg and the blind panel itself. Live CLI trials of
  // 2026-09-15 put arm C alone at 782-1694 s. 15 minutes is the honest opening
  // promise; `useDurableRun` stops promising entirely past three times it.
  bench: 900_000,
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
