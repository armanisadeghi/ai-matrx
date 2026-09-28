// features/education/convert/segmentedGenerate.ts
//
// THE one way a converter generator produces a LIST of items (cards, questions,
// mnemonics, key points, nodes) from source material.
//
// It pairs the coverage planner (`coverage.ts`) with the headless agent runner
// (`runAgentExtraction.ts`): plan the source into sections, run the generator's
// mandate once per section with that section's own count, merge, de-duplicate,
// and report the sections that failed instead of silently shipping a gap.
//
// Every generator that used to send `source.text` in one call with a hardcoded
// count now calls this instead. Do NOT hand-roll a second fan-out: the dedupe
// rule, the gap reporting, the single-pass fast path and the background-run
// rule (see below) all have to stay identical across targets or the kit starts
// producing artifacts of wildly different completeness from one source.
//
// THE SINGLE-WRITER RULE. A segmented run makes N agent calls, which means N
// conversations. If those ran "live" (kept instance), the canvas materializer
// would turn each one's render block into its OWN artifact and one deck would
// land as eight. So: a multi-section run is BACKGROUND, and reports progress
// through `ctx.onProgress` instead of a token stream. A single-section run
// (a short paste) keeps the old live behaviour, and its conversationId is
// returned so the caller can still go through the single-writer dedupe path.

import {
  describeGaps,
  planCoverage,
  runOverSegments,
  segmentConcurrency,
  type CoveragePlan,
  type SourceSegment,
} from "./coverage";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import { runAgentExtraction } from "./runAgentExtraction";
import type {
  ConvertContext,
  ConvertOptions,
  ConvertSource,
  TargetKind,
} from "./types";
import type { SourceFeature } from "@/features/agents/types/instance.types";

export interface SegmentedGenerateArgs<T> {
  ctx: ConvertContext;
  source: ConvertSource;
  targetKind: TargetKind;
  options?: ConvertOptions;
  /** The MANDATE to run per section (resolved live to a DB-bound agent). */
  mandateKey: AnyMandateKey;
  surfaceKey: string;
  sourceFeature: SourceFeature;
  /**
   * Build the agent variables for ONE section. `segment.text` is already
   * chunk-marked for grounding and `segment.items` is that section's share of
   * the total, so a caller normally just names the variables its agent declares.
   */
  variables: (segment: SourceSegment, plan: CoveragePlan) => Record<string, string>;
  /** Pull this section's items out of its extracted JSON. Never throws. */
  extract: (value: unknown, segment: SourceSegment) => T[];
  /**
   * Stable identity for cross-section de-duplication. Two sections that both
   * define the same term genuinely do produce the same card, and shipping it
   * twice is the most visible way a segmented deck looks careless.
   */
  identity: (item: T) => string;
  /**
   * Optional "these two say the same thing" test, beyond an exact identity
   * match. Two sections that both teach one idea word it differently ("What
   * is osmosis?" twice, verify-1 2026-09-28); exact keys miss that. See
   * `isNearDuplicateQA` for the question/answer rule every list target uses.
   */
  sameAs?: (a: T, b: T) => boolean;
  /** Per-section ceiling. Defaults to 120s (one section is a small ask). */
  timeoutMs?: number;
}

export interface SegmentedGenerateResult<T> {
  items: T[];
  plan: CoveragePlan;
  /**
   * The conversation of the single-pass run, or null for a multi-section run
   * (which has many and belongs to none of them).
   */
  conversationId: string | null;
  /** The raw extracted value of the FIRST successful section, for a title. */
  firstValue: unknown;
  /** One honest sentence when sections were missed, else null. */
  gapNote: string | null;
  /** Sections that produced nothing. */
  missedCount: number;
}

const STOPWORDS = new Set(
  "a an and are as at be by can do does did for from how in into is it its of on or the this that to was were what when where which who whom why will with you your".split(
    " ",
  ),
);

/** The meaningful words of a string, for near-duplicate tests. */
export function contentWords(s: string): Set<string> {
  return new Set(
    looseKey(s)
      .split(" ")
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let both = 0;
  for (const w of a) if (b.has(w)) both += 1;
  return both / (a.size + b.size - both);
}

function contained(small: Set<string>, big: Set<string>): boolean {
  if (small.size === 0) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/**
 * Two question/answer items that teach the same thing: the questions share
 * most of their words, or one question's words all sit inside the other's AND
 * the answers overlap. The answer check keeps "What is osmosis?" apart from
 * "In forward osmosis, how is a draw solution used?".
 */
export function isNearDuplicateQA(
  a: { question: string; answer: string },
  b: { question: string; answer: string },
): boolean {
  // "What is osmotic pressure?" and "What is osmotic pressure, and why is it
  // colligative?" — the longer question is the shorter one plus "and …".
  const ka = looseKey(a.question);
  const kb = looseKey(b.question);
  const [shortKey, longKey] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (
    shortKey.split(" ").length >= 2 &&
    (longKey === shortKey ||
      longKey.startsWith(`${shortKey} and `) ||
      longKey.startsWith(`${shortKey} or `))
  ) {
    return true;
  }
  const qa = contentWords(a.question);
  const qb = contentWords(b.question);
  if (qa.size > 0 && qb.size > 0 && jaccard(qa, qb) >= 0.6) return true;
  const [small, big] = qa.size <= qb.size ? [qa, qb] : [qb, qa];
  if (!contained(small, big)) return false;
  return jaccard(contentWords(a.answer), contentWords(b.answer)) >= 0.3;
}

/** Normalized identity: case- and punctuation-insensitive, whitespace-collapsed. */
export function looseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function segmentedGenerate<T>({
  ctx,
  source,
  targetKind,
  options,
  mandateKey,
  surfaceKey,
  sourceFeature,
  variables,
  extract,
  identity,
  sameAs,
  timeoutMs,
}: SegmentedGenerateArgs<T>): Promise<SegmentedGenerateResult<T>> {
  const plan = await planCoverage({
    text: source.text,
    targetKind,
    depth: options?.depth,
    requestedTotal: options?.count,
  });
  const live = plan.singlePass;
  const concurrency = live ? 1 : await segmentConcurrency();

  let firstValue: unknown = null;
  let conversationId: string | null = null;
  let settled = 0;
  let itemCount = 0;

  const { results, missed } = await runOverSegments(
    plan.segments,
    async (segment) => {
      const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
        mandateKey,
        surfaceKey,
        sourceFeature,
        organizationId: ctx.orgId,
        // THE COUNT LAW's spare: with an explicit count each section is asked
        // for one more than its share, so a dropped duplicate or a short
        // answer elsewhere is filled from the spares instead of shipping
        // fewer than the person asked for. The merge still keeps only shares
        // first and trims to the total.
        variables: variables(
          options?.count ? { ...segment, items: segment.items + 1 } : segment,
          plan,
        ),
        timeoutMs: timeoutMs ?? 120_000,
        live,
        // Only a single-pass run has a stream worth showing; a fan-out reports
        // sections instead (see THE SINGLE-WRITER RULE above).
        onRequestId: live ? ctx.onRequestId : undefined,
      });
      if (firstValue === null) {
        firstValue = extracted.value;
        if (live) conversationId = extracted.conversationId;
      }
      const items = extract(extracted.value, segment);
      settled += 1;
      itemCount += items.length;
      ctx.onProgress?.({
        done: settled,
        total: plan.segments.length,
        label: segment.label,
        items: itemCount,
      });
      return items;
    },
    concurrency,
  );

  // A failed section still advances the counter the student is watching.
  for (const m of missed) {
    settled += 1;
    ctx.onProgress?.({
      done: settled,
      total: plan.segments.length,
      label: m.label,
      items: itemCount,
    });
  }

  // An explicit count is a promise (THE COUNT LAW); a source-scaled run keeps
  // everything its sections wrote.
  const items = mergeSectionItems(
    plan,
    results,
    identity,
    sameAs,
    options?.count ? plan.total : undefined,
  );

  return {
    items,
    plan,
    conversationId,
    firstValue,
    gapNote: describeGaps(missed),
    missedCount: missed.length,
  };
}

/**
 * Merge every section's items into one de-duplicated list (exact and near
 * duplicates dropped across sections).
 *
 * With a `limit` — the person asked for a number — the list is EXACTLY that
 * long (or shorter when the sections came back short). THE COUNT LAW: a
 * person who asked for 5 gets 5; a model that wrote more than its section's
 * share does not inflate the deck (verify-1: asked 5, got 10). Each section's
 * own share goes first so coverage stays spread across the material; a
 * section's extras only fill the gap a short or duplicate-heavy section left.
 */
export function mergeSectionItems<T>(
  plan: Pick<CoveragePlan, "segments">,
  results: (T[] | null)[],
  identity: (item: T) => string,
  sameAs?: (a: T, b: T) => boolean,
  limit?: number,
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  const admit = (item: T): boolean => {
    const key = identity(item);
    if (key && seen.has(key)) return false;
    if (sameAs && kept.some((k) => sameAs(k, item))) return false;
    if (key) seen.add(key);
    kept.push(item);
    return true;
  };
  const extras: T[] = [];
  results.forEach((batch, i) => {
    if (!batch) return;
    const share =
      limit === undefined ? batch.length : (plan.segments[i]?.items ?? batch.length);
    let taken = 0;
    for (const item of batch) {
      if (taken < share) {
        if (admit(item)) taken += 1;
      } else {
        extras.push(item);
      }
    }
  });
  if (limit === undefined) return kept;
  for (const item of extras) {
    if (kept.length >= limit) break;
    admit(item);
  }
  return kept.slice(0, Math.max(0, limit));
}
