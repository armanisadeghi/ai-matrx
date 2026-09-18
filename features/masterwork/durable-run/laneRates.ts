// features/masterwork/durable-run/laneRates.ts
//
// 🚨 WHAT EACH MASTERWORK LANE COSTS **PER UNIT OF WORK** — so the sentence a
// person reads is about THEIR run, not about the lane's median.
//
// ## Why this table exists beside `EXPECTED_MS`
//
// `EXPECTED_MS` (useMasterworkRun.ts) is one number per lane, read off
// `platform.masterwork_run`. It was a real improvement over the hardcoded
// "this takes a minute" it replaced, and it is still the right FLOOR for a
// lane that cannot know its own size (a Bench trial, an Audition — the work is
// the Rulebook, not something the person just handed over).
//
// But an ingest lane DOES know. On 2026-09-17 an Expert put one 558 KB EPUB
// through `/masterworks/ingest` and the screen promised "about 2 minutes" for
// a run that took 8m11s (`platform.masterwork_run` 617856c6 — completed,
// 85 rules, 82 quotes verified word-for-word). An independent verifier read
// the motionless promise, stopped watching at 2m40s, and reported the whole
// pipeline broken. Nothing was broken. A lane median was being stated as a
// fact about a specific run, and it was not one.
//
// So every lane whose door counts something states a RATE here, and
// `sizedEstimateMs` turns that rate plus the real pile into the promise.
//
// ## The measurements
//
// Ledger medians, `platform.masterwork_run`, read 2026-09-12:
//   ingest 157s (p90 310s, max 352s) · ingest_corpus 156s (p90 272s, max 312s)
//   ingest_dump 83s (p90 295s, max 402s) · ingest_chat 18s
//
// Sized datapoints, 2026-09-17 (acquisition-frontier §7.1/§7.3):
//   run 7dfbbb00 — one 558 KB EPUB (~122k words) through `ingest_dump`'s
//     sub-pipeline: 151.5s, 125 draft rules, 124 quotes verified.
//   run 617856c6 — the same file through `ingest`: 491s, 85 rules.
//   run 76778863 — 19 files (~24 MB: an EPUB, 12 photos, a scanned PDF, a 2h
//     M4B) reached "11 of 19" in 327s with the fan-out UNCAPPED, then was
//     falsely reaped. The server now caps that fan-out at
//     `knobs.resource_fan_out` = 4 (aidream mw_066), which is the
//     `concurrency` mirrored below.
//
// 🚨 RE-MEASURE when a pipeline changes, exactly as `EXPECTED_MS` demands —
// and change the numbers here rather than adding a second table somewhere.

import type { MeasuredRate } from "@/lib/progress/sizedEstimate";

/**
 * KNOB MIRROR of aidream `knobs.resource_fan_out` (platform.feature_knob
 * "masterwork.ingest" / "resource_fan_out", seeded at 4 by mw_066). It is how
 * many resources the server really reads at once, so it is how many the
 * promise is allowed to overlap. Change the row, then re-mirror this literal;
 * the value has no sync read path on the client.
 */
export const RESOURCE_FAN_OUT = 4;

/**
 * ONE SOURCE, read end to end (`/masterworks/ingest`, `/masterworks/ingest-file`).
 *
 * Anchored on run 7dfbbb00: 0.532 MB → 151.5s. `setupMs` is the fixed part
 * (reader, chunking, the dedupe and quote-verification passes); the per-MB and
 * per-1k-word terms are two views of the same text and a caller states
 * whichever one its door actually counted.
 */
export const SOURCE_INGEST_RATE: MeasuredRate = {
  setupMs: 25_000,
  perMegabyteMs: 230_000,
  perThousandWordsMs: 1_050,
  // Transcription first, then the ingest above. A minute of speech is ~150
  // words, and the transcript then rides the per-word term; this is the
  // transcription leg alone.
  perRecordedSecondMs: 250,
  measuredFrom:
    "platform.masterwork_run median 157s (2026-09-12); run 7dfbbb00 0.532 MB → 151.5s and run 617856c6 same file → 491s (2026-09-17)",
};

/**
 * A PILE of resources (`/masterworks/ingest-dump`), each its own sub-pipeline,
 * four at a time.
 *
 * The per-megabyte term is deliberately far below `SOURCE_INGEST_RATE`'s: a
 * dump's megabytes are mostly photographs and audio containers, whose bytes
 * say almost nothing about how much TEXT the distiller will read. The per-item
 * term carries the weight, anchored on the 83s median (a typical dump is a
 * handful of items, so one wave).
 */
export const DUMP_INGEST_RATE: MeasuredRate = {
  setupMs: 20_000,
  perItemMs: 63_000,
  perMegabyteMs: 40_000,
  concurrency: RESOURCE_FAN_OUT,
  measuredFrom:
    "platform.masterwork_run ingest_dump median 83s / p90 295s (2026-09-12); run 76778863 reached 11 of 19 in 327s uncapped (2026-09-17)",
};

/**
 * EVERYTHING THE EXPERT HAS PUBLISHED (`/masterworks/ingest-corpus`) — the
 * same shape as a dump, over links rather than uploads, so the bytes are
 * unknown and the item count is everything. Median 156s over corpora that were
 * typically a handful of pages.
 */
export const CORPUS_INGEST_RATE: MeasuredRate = {
  setupMs: 20_000,
  perItemMs: 135_000,
  concurrency: RESOURCE_FAN_OUT,
  measuredFrom:
    "platform.masterwork_run ingest_corpus median 156s / p90 272s (2026-09-12); corpus item 1a5fd47d one live URL → 177s",
};

/**
 * CONVERSATIONS out of an export (`/masterworks/ingest-chat`,
 * `/masterworks/ingest-conversations`). Median 18s, and the pile is counted in
 * conversations the person ticked — three is not two hundred.
 */
export const CHAT_INGEST_RATE: MeasuredRate = {
  setupMs: 12_000,
  perItemMs: 6_000,
  concurrency: RESOURCE_FAN_OUT,
  measuredFrom:
    "platform.masterwork_run ingest_chat median 18s (2026-09-12), typically 2-3 conversations",
};
