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
//
// THE NO-FREEZE RULE (2026-09-30). A 4-card deck from an 87k-character
// transcript sat on "Making 4 cards" for 20+ minutes: the section calls were
// awaited with no end-to-end bound (the agent launch awaits the whole stream,
// so the old 120s "ceiling" only covered extraction after it), and a section
// whose server never answered held the run forever while the line never
// moved. Now every attempt has a deadline and is cancelled when it passes; a
// stalled or failed section is tried ONCE more; a section that still fails is
// reported the moment it fails; and progress ticks from the start. The run
// always ends, with whatever the sections that answered produced.

import {
  describeGaps,
  planCoverage,
  runOverSegments,
  segmentConcurrency,
  type CoveragePlan,
  type SourceSegment,
} from "./coverage";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { runAgentExtraction } from "./runAgentExtraction";
import { recoverSectionValue, sectionPlanKey } from "./sectionJournal";
import type {
  ConvertContext,
  ConvertOptions,
  ConvertSource,
  TargetKind,
} from "./types";
import type { SourceFeature } from "@ai-matrx/chat/agents/types/instance.types";
import { formatDurationMs } from "@ai-matrx/kit/format";

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
  /**
   * Deadline for ONE attempt at one section, end to end (launch, stream and
   * extraction). Defaults to 120s — one section is a small ask. A section that
   * misses it is cancelled and tried once more (see THE NO-FREEZE RULE).
   */
  timeoutMs?: number;
  /**
   * The material split by Source (their texts joined are `source.text`).
   * Two or more → THE EVERY-SOURCE RULE (`planCoverage`): no section spans two
   * Sources and each gets at least one item.
   */
  groups?: readonly { label: string; text: string }[];
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
  /**
   * Why sections failed, in the words the failure gave (a usage limit, a
   * refusal) — null when nothing failed or every failure was a timeout. A run
   * that made nothing says THIS, never a guess (see `emptyRunMessage`).
   */
  failureReason: string | null;
  /** The `groups` index a kept item was made from (undefined without groups). */
  groupOf: (item: T) => number | undefined;
}

/** One section's end-to-end deadline per attempt, when the caller names none. */
export const SECTION_ATTEMPT_DEADLINE_MS = 120_000;
/** A section is tried this many times before it is reported missed. */
export const SECTION_MAX_ATTEMPTS = 2;

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
  groups,
}: SegmentedGenerateArgs<T>): Promise<SegmentedGenerateResult<T>> {
  const plan = await planCoverage({
    text: source.text,
    targetKind,
    depth: options?.depth,
    requestedTotal: options?.count,
    groups,
  });
  const madeIn = new Map<T, number>();
  const live = plan.singlePass;
  const concurrency = live ? 1 : await segmentConcurrency();

  let firstValue: unknown = null;
  let conversationId: string | null = null;
  let settled = 0;
  let itemCount = 0;
  let failed = 0;
  let retrying = 0;
  const deadlineMs = timeoutMs ?? SECTION_ATTEMPT_DEADLINE_MS;
  const total = plan.segments.length;
  // THE KIT SURVIVES THE TAB: sections this plan already ran (before a reload
  // or a closed tab) are read back from the server, never paid for twice.
  const journal = ctx.sections;
  const planKey = journal ? sectionPlanKey(targetKind, source.text, plan) : "";
  const recorded = journal ? journal.recorded(planKey) : {};
  const report = (label: string) =>
    ctx.onProgress?.({ done: settled, total, label, items: itemCount, failed, retrying });

  // Ticks from the start: the person sees the run is under way before the
  // first section answers (a long source can take a minute to its first).
  report("");

  /** One attempt at one section, bounded end to end by `deadlineMs`. */
  /** The conversation each section's latest attempt ran in (segment id → id). */
  const lastRun = new Map<string, string>();
  const attempt = async (segment: SourceSegment) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Cancels the stalled call (server told to stop, local read closed).
        controller.abort();
        reject(
          new Error(
            `No answer within ${formatDurationMs(deadlineMs, { style: "long", parts: 2 })} for section ${segment.index} of ${segment.total}`,
          ),
        );
      }, deadlineMs);
    });
    try {
      return await Promise.race([
        runAgentExtraction(ctx.dispatch, ctx.store, {
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
          timeoutMs: deadlineMs,
          signal: controller.signal,
          live,
          // Only a single-pass run has a stream worth showing; a fan-out reports
          // sections instead (see THE SINGLE-WRITER RULE above).
          onRequestId: live ? ctx.onRequestId : undefined,
          onConversationCreated: (conversationId) => {
            lastRun.set(segment.id, conversationId);
            journal?.started(planKey, segment.id, conversationId);
            if (live) ctx.onConversationCreated?.(conversationId);
          },
        }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
      // A call that lost the race is no longer anyone's (THE NO-FREEZE RULE).
      deadline.catch(() => {});
    }
  };

  const { results, missed, reasons } = await runOverSegments(
    plan.segments,
    async (segment) => {
      let extracted: { value: unknown; conversationId: string } | null = null;
      const earlier = recorded[segment.id];
      if (earlier) {
        const value = await recoverSectionValue(earlier, { deadlineMs });
        if (value != null) extracted = { value, conversationId: earlier };
      }
      for (let n = 1; extracted === null; n++) {
        try {
          extracted = await attempt(segment);
        } catch (error) {
          // A PAID ANSWER IS NEVER THROWN AWAY: the attempt that missed its
          // deadline may still have finished on the server (a slow queue, a
          // stream that never reached this tab). Read it back before paying
          // for the section again — and before calling it missed.
          const ran = lastRun.get(segment.id);
          const value = ran
            ? await recoverSectionValue(ran, { deadlineMs: n >= SECTION_MAX_ATTEMPTS ? 30_000 : 5_000 })
            : null;
          if (value != null && ran) {
            if (n > 1) retrying -= 1;
            extracted = { value, conversationId: ran };
            break;
          }
          if (n >= SECTION_MAX_ATTEMPTS || isRefusal(error)) {
            if (n > 1) retrying -= 1;
            settled += 1;
            failed += 1;
            // Reported the moment it fails, never held to the end of the run.
            report(segment.label);
            throw error;
          }
          console.warn(
            `[convert/segmentedGenerate] section ${segment.id} (${segment.label}) attempt ${n} failed — retrying:`,
            error,
          );
          if (n === 1) retrying += 1;
          report(segment.label);
        }
        if (extracted !== null && n > 1) retrying -= 1;
      }
      if (firstValue === null) {
        firstValue = extracted.value;
        if (live) conversationId = extracted.conversationId;
      }
      const items = extract(extracted.value, segment);
      if (segment.group !== undefined) for (const item of items) madeIn.set(item, segment.group);
      settled += 1;
      // THE COUNT LAW reaches the progress line too (V4-F, 2026-09-30): a run
      // asked for 5 said "8 cards so far" because each section's spare (and any
      // over-delivery) was counted. With an explicit count a section adds at
      // most its own share, and the running total never passes the request —
      // the merge below keeps exactly that many.
      itemCount = progressItemCount(itemCount, items.length, segment.items, options?.count ? plan.total : undefined);
      report(segment.label);
      return items;
    },
    concurrency,
    isRefusal,
  );

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
    failureReason: pickFailureReason(reasons),
    groupOf: (item) => madeIn.get(item),
  };
}

/**
 * The running item count a progress line shows after one more section settles.
 * Without a requested total it is simply everything written. With one (THE
 * COUNT LAW) a section adds at most its own share — its spare and any
 * over-delivery are not cards the person will get — and the total is capped at
 * the request, so the line can never read "8 so far" on a 5-card run.
 */
export function progressItemCount(
  before: number,
  produced: number,
  share: number,
  requested?: number,
): number {
  if (requested === undefined) return before + produced;
  return Math.min(requested, before + Math.min(produced, share));
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

/**
 * A failure every remaining section would hit the same way: the person is out
 * of AI usage, or the request was refused (age/consent gate, no access). It is
 * neither retried nor repeated across sections.
 */
export function isRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ExpectedRequestConflictError") return true;
  return /usage limit|usage_limit_reached|not allowed|consent|forbidden|permission/i.test(error.message);
}

/** The deadline message this module throws for a stalled section. */
const DEADLINE_PREFIX = "No answer within ";

/** The most telling failure: a refusal first, else the commonest non-timeout message. */
export function pickFailureReason(reasons: readonly string[]): string | null {
  const real = reasons.filter((r) => !r.startsWith(DEADLINE_PREFIX) && !/aborted/i.test(r));
  if (real.length === 0) return null;
  const refusal = real.find((r) => isRefusal(new Error(r)));
  if (refusal) return refusal;
  const tally = new Map<string, number>();
  for (const r of real) tally.set(r, (tally.get(r) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * The one sentence a run that made NOTHING shows. Every section failed →
 * the failure's own words (a usage limit says so), or "did not answer in
 * time" only when timeouts were the cause. Sections answered but nothing new
 * survived → `nothingNew`.
 */
export function emptyRunMessage(
  outcome: { missed: number; sections: number; failureReason: string | null },
  noun: "cards" | "questions",
  nothingNew: string,
): string {
  const allFailed = outcome.missed > 0 && outcome.missed >= outcome.sections;
  if (outcome.failureReason && (allFailed || isRefusal(new Error(outcome.failureReason)))) {
    return `No ${noun} were made: ${outcome.failureReason}`;
  }
  if (allFailed) return `The AI did not answer in time, so no ${noun} were made. Try again.`;
  return nothingNew;
}
