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
  mandateKey: string;
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
        variables: variables(segment, plan),
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

  const seen = new Set<string>();
  const items: T[] = [];
  for (const batch of results) {
    if (!batch) continue;
    for (const item of batch) {
      const key = identity(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      items.push(item);
    }
  }

  return {
    items,
    plan,
    conversationId,
    firstValue,
    gapNote: describeGaps(missed),
    missedCount: missed.length,
  };
}
