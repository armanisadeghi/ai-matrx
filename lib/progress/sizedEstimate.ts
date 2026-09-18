// lib/progress/sizedEstimate.ts
//
// 🚨 A DURATION PROMISE IS A MEASUREMENT OF *THIS* RUN, NEVER A CONSTANT.
//
// 2026-09-17, acquisition-frontier §7.3: the ingest dialog told an Expert
// "Working — this usually takes about 2 minutes" over a run that took 8m11s
// (`platform.masterwork_run` 617856c6, 85 rules added, 82 quotes verified
// word-for-word). An independent verifier watched that sentence, stopped at
// 2m40s, and filed the whole pipeline as broken. It was not broken. The
// promise was.
//
// The promise was a constant — one number per LANE (`EXPECTED_MS`), read
// whatever the person had actually handed over. One 558 KB EPUB and a pile of
// nineteen files got the same sentence. A lane-wide median is a fact about the
// lane; it is not a fact about the run in front of this person, and a screen
// that states it as one is lying in exactly the way law #4 forbids.
//
// So a promise is now computed: the platform's MEASURED per-unit history
// (`MeasuredRate` — where every number carries the run it came from) applied to
// the REAL size of what was handed over (`WorkSize` — files, bytes, pages,
// words, recorded seconds). A bigger pile always promises a longer wait,
// which is the whole property `an-estimate-is-measured-not-declared.test.ts`
// holds the platform to.
//
// It does NOT replace the honest-after-the-fact half: `estimateSentence` and
// `elapsed.ts` still stop promising once a promise has been overtaken. This
// file only makes the opening promise true more often.

/**
 * HOW BIG THE WORK IN FRONT OF THIS PERSON ACTUALLY IS.
 *
 * Every field is optional because a lane knows only what its own door
 * collected: the dump panel counts resources and bytes, the paste box counts
 * words, the monologue lane counts recorded seconds. A lane states what it
 * knows and nothing else — an invented page count would be the same class of
 * defect as the constant this file replaces.
 */
export interface WorkSize {
  /** Separate things the run must read — files, links, conversations, cases. */
  items?: number;
  /** Total bytes handed over, across every item. */
  bytes?: number;
  /** Pages, for a source that counts in pages (a scanned PDF). */
  pages?: number;
  /** Words, for text a person pasted rather than uploaded. */
  words?: number;
  /** Seconds of audio or video to be transcribed first. */
  seconds?: number;
}

/**
 * WHAT THE PLATFORM HAS MEASURED ABOUT RUNS OF THIS KIND, per unit of work.
 *
 * `measuredFrom` is required and is not decoration: a rate with no provenance
 * is a guess wearing a lab coat, and the next person to touch it cannot tell
 * whether it was read off the ledger or typed from memory. Cite the run ids or
 * the query.
 */
export interface MeasuredRate {
  /** What a run of this kind costs before it reads anything at all. */
  setupMs: number;
  /** Per separate thing the run opens — its own reader, its own model call. */
  perItemMs?: number;
  /** Per megabyte of source handed over. */
  perMegabyteMs?: number;
  /** Per page, for lanes whose readers are paginated. */
  perPageMs?: number;
  /** Per thousand words of pasted text. */
  perThousandWordsMs?: number;
  /** Per second of recorded audio or video (transcription is not free). */
  perRecordedSecondMs?: number;
  /**
   * How many items the SERVER really runs at once — the mirror of aidream's
   * `knobs.resource_fan_out`. Work divides by this, which is why nineteen
   * files do not promise nineteen times one file.
   */
  concurrency?: number;
  /** Where these numbers came from. Run ids, a query, a date. */
  measuredFrom: string;
}

const BYTES_PER_MB = 1_048_576;

/** True when this size says nothing at all — the caller knows no size yet. */
export function isEmptyWorkSize(size: WorkSize | null | undefined): boolean {
  if (!size) return true;
  return (
    !size.items && !size.bytes && !size.pages && !size.words && !size.seconds
  );
}

/**
 * THE PROMISE, for this run, in milliseconds.
 *
 * Returns `rate.setupMs` for a size that states nothing — a caller that knows
 * no size gets the floor, never a fabricated number for a pile it cannot see.
 * Every lane that CAN state a size is required to (see the census guard).
 */
export function sizedEstimateMs(
  rate: MeasuredRate,
  size: WorkSize | null | undefined,
): number {
  if (isEmptyWorkSize(size)) return Math.round(rate.setupMs);
  const known = size as WorkSize;
  const work =
    (rate.perItemMs ?? 0) * (known.items ?? 0) +
    ((rate.perMegabyteMs ?? 0) * (known.bytes ?? 0)) / BYTES_PER_MB +
    (rate.perPageMs ?? 0) * (known.pages ?? 0) +
    ((rate.perThousandWordsMs ?? 0) * (known.words ?? 0)) / 1_000 +
    (rate.perRecordedSecondMs ?? 0) * (known.seconds ?? 0);
  // A lane only overlaps what it has several of. One 558 KB EPUB is read by
  // one sub-pipeline however high the server's cap is, so its promise must not
  // be divided by four.
  const lanes = Math.max(
    1,
    Math.min(rate.concurrency ?? 1, Math.max(1, known.items ?? 1)),
  );
  return Math.round(rate.setupMs + work / lanes);
}

/**
 * "19 files · 24.1 MB" — what the person actually handed over, said back to
 * them beside the promise, so a wait they did not expect is legible as the
 * size of the thing they asked for rather than as a hang.
 *
 * Null when nothing is known, because an empty line is chrome.
 */
export function describeWorkSize(size: WorkSize | null | undefined): string | null {
  if (isEmptyWorkSize(size)) return null;
  const known = size as WorkSize;
  const parts: string[] = [];
  if (known.items) {
    parts.push(`${known.items} ${known.items === 1 ? "source" : "sources"}`);
  }
  if (known.pages) {
    parts.push(`${known.pages} ${known.pages === 1 ? "page" : "pages"}`);
  }
  if (known.words) {
    parts.push(`${Math.round(known.words / 1_000) || 1}k words`);
  }
  if (known.seconds) {
    const minutes = Math.max(1, Math.round(known.seconds / 60));
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"} recorded`);
  }
  if (known.bytes) {
    const mb = known.bytes / BYTES_PER_MB;
    parts.push(mb < 1 ? `${Math.max(1, Math.round(known.bytes / 1024))} KB` : `${mb.toFixed(1)} MB`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
