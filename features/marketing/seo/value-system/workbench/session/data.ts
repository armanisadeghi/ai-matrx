/**
 * THE RULING SESSION — data layer.
 *
 * Three reads and ONE proposal write, all of them RPCs on the `seo` schema
 * under the caller's own JWT.
 *
 * 🚨 THIS MODULE OPENS NO WRITE PATH OF ITS OWN. The session's assignments go
 * through the same functions a person clicking anywhere else in the keyword
 * system calls — `setKeywordStamps`, `setKeywordService`, `setGscKeywordClass`
 * — and its RULE changes go through `seo.keyword_meaning_suggest`, the C9
 * suggestion spine, so nothing an agent proposed can land without a human
 * saying yes (P12). The only thing written here is a PROPOSAL.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 *      § THE RULING SESSION
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import type { Json } from "@/types/database.types";
import type { KeywordMeaningProposal } from "@/features/marketing/seo/value-system/suggestions/proposal";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("run your ruling session");

/**
 * The RPCs answer refusals in sentences written for the person reading them.
 * Strip the machine code, keep the sentence — the same rule the keyword
 * workbench's data layer follows.
 */
const GOVERNED = /^(seo_[a-z_]+|gsc_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNED);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

/* ------------------------------------------------------------- the queue */

export interface SessionQueueRow {
  keywordId: string;
  keyword: string;
  clicks: number;
  impressions: number;
  /** The diversity half of "why this one" — the client adds the numbers. */
  whyDistinct: string;
  /** The kept phrase this one is closest to, when there is one. */
  closestKept: string | null;
}

export interface SessionQueue {
  rows: SessionQueueRow[];
  /** Every keyword in the window carrying no human meaning at all. */
  unruledTotal: number;
  /** How deep the server looked to fill this batch — near-duplicates skipped. */
  considered: number;
}

/**
 * SMART SAMPLING, server-side, in ONE read: real demand (clicks, then
 * impressions) AND diversity (a candidate is skipped when it is a near
 * duplicate of one already chosen, by trigram similarity or word overlap).
 *
 * `exclude` carries the keywords this session has already shown, so pressing
 * on never re-asks the same question.
 */
export async function getRulingSessionQueue(
  siteId: string,
  start: string,
  end: string,
  limit: number,
  exclude: string[],
  signal?: AbortSignal,
): Promise<SessionQueue> {
  const response = await (await seoDb())
    .rpc("gsc_ruling_session_queue", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      p_limit: limit,
      ...(exclude.length > 0 ? { p_exclude: exclude } : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "choose what to ask you about",
  );
  return {
    rows: (rows ?? []).map((row) => ({
      keywordId: row.keyword_id,
      keyword: row.keyword,
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      whyDistinct: row.why_distinct,
      closestKept: row.closest_kept,
    })),
    unruledTotal: Number(rows?.[0]?.unruled_total ?? 0),
    considered: Number(rows?.[0]?.considered ?? 0),
  };
}

/* --------------------------------------------- what the site's rules know */

export interface MatcherProbeHit {
  keywordId: string;
  dimensionSlug: string;
  dimensionLabel: string;
  valueId: string;
  valueSlug: string;
  valueLabel: string;
  matcherId: string;
  matcherKind: string;
  matcherPattern: string | null;
}

/**
 * THE SITE'S OWN RULES FIRST. Read-only: `seo.fn_evaluate_matchers` answers the
 * same question by STAMPING, which is the wrong verb for a proposal nobody has
 * approved yet. Keyed by keyword id; a keyword the rules cannot explain is
 * simply absent, and that absence is what the AI is asked about.
 */
export async function probeSiteMatchers(
  siteId: string,
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, MatcherProbeHit[]>> {
  const map = new Map<string, MatcherProbeHit[]>();
  if (keywordIds.length === 0) return map;
  const response = await (await seoDb())
    .rpc("gsc_ruling_session_matcher_probe", {
      p_site_id: siteId,
      p_keyword_ids: keywordIds,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "ask your own rules what they already know",
  );
  for (const row of rows ?? []) {
    const hit: MatcherProbeHit = {
      keywordId: row.keyword_id,
      dimensionSlug: row.dimension_slug,
      dimensionLabel: row.dimension_label,
      valueId: row.value_id,
      valueSlug: row.value_slug,
      valueLabel: row.value_label,
      matcherId: row.matcher_id,
      matcherKind: row.matcher_kind,
      matcherPattern: row.matcher_pattern,
    };
    const existing = map.get(row.keyword_id);
    if (existing) existing.push(hit);
    else map.set(row.keyword_id, [hit]);
  }
  return map;
}

/* --------------------------------------------------- what a rule would catch */

export interface MatcherReach {
  kind: string;
  pattern: string;
  keywords: number;
  clicks: number;
  impressions: number;
  /** Keywords that ALREADY carry this value — the rule only re-states them. */
  alreadyValued: number;
  /** Keywords the rule would newly reach. The honest half of the headline. */
  newlyValued: number;
  sample: Array<{
    keywordId: string;
    keyword: string;
    clicks: number;
    impressions: number;
    alreadyValued: boolean;
  }>;
}

function num(row: Record<string, Json>, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * How big this rule change actually is, in the site's own numbers, BEFORE
 * anyone approves it. Answered by `seo.gsc_matcher_reach_preview`, which runs
 * the same predicate as the matcher engine — a preview that could disagree with
 * the engine would be worse than no preview.
 */
export async function previewMatcherReach(
  input: {
    siteId: string;
    start: string;
    end: string;
    kind: string;
    pattern: string;
    valueId?: string | null;
    sample?: number;
  },
  signal?: AbortSignal,
): Promise<MatcherReach> {
  const response = await (await seoDb())
    .rpc("gsc_matcher_reach_preview", {
      p_site_id: input.siteId,
      p_start: input.start,
      p_end: input.end,
      p_kind: input.kind,
      p_pattern: input.pattern,
      ...(input.valueId ? { p_value_id: input.valueId } : {}),
      p_sample: input.sample ?? 6,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const raw = assertGoverned(
    response.data,
    response.error,
    "work out what that rule would catch",
  ) as unknown as Record<string, Json>;
  const sample = Array.isArray(raw.sample) ? raw.sample : [];
  return {
    kind: typeof raw.kind === "string" ? raw.kind : input.kind,
    pattern: typeof raw.pattern === "string" ? raw.pattern : input.pattern,
    keywords: num(raw, "keywords"),
    clicks: num(raw, "clicks"),
    impressions: num(raw, "impressions"),
    alreadyValued: num(raw, "already_valued"),
    newlyValued: num(raw, "newly_valued"),
    sample: sample.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, Json>;
      if (typeof row.keyword_id !== "string" || typeof row.keyword !== "string") {
        return [];
      }
      return [
        {
          keywordId: row.keyword_id,
          keyword: row.keyword,
          clicks: num(row, "clicks"),
          impressions: num(row, "impressions"),
          alreadyValued: row.already_valued === true,
        },
      ];
    }),
  };
}

/* -------------------------------------------------- closing the loop honestly */

export interface MatcherRunResult {
  scopeKeywords: number;
  matchers: number;
  stamped: number;
  removed: number;
  conflicts: number;
}

/**
 * RUN THE ENGINE — THE one client wrapper over `seo.fn_evaluate_matchers`.
 *
 * There was none before this file, which meant the approval receipt could say
 * "re-run the matchers to stamp keywords with it" while the app offered no way
 * to do that anywhere. A loop that ends at "a rule now exists" has not closed;
 * it closes when the corpus actually changes and the numbers are reported back.
 *
 * Whole-site by default because a new matcher's reach is not confined to the
 * keywords that produced it — that is the entire point of writing a rule.
 */
export async function runSiteMatchers(
  siteId: string,
  keywordIds?: string[],
): Promise<MatcherRunResult> {
  const response = await (await seoDb()).rpc("fn_evaluate_matchers", {
    p_site_id: siteId,
    ...(keywordIds?.length ? { p_keyword_ids: keywordIds } : {}),
  });
  const raw = assertGoverned(
    response.data,
    response.error,
    "run your rules over the keywords",
  ) as unknown as Record<string, Json>;
  return {
    scopeKeywords: num(raw, "scope_keywords"),
    matchers: num(raw, "matchers"),
    stamped: num(raw, "stamped"),
    removed: num(raw, "removed"),
    conflicts: num(raw, "single_cardinality_conflicts"),
  };
}

/* ------------------------------------------------------- the C9 proposal */

export type SuggestionStatus = "created" | "already_pending" | "already_decided";

export interface SuggestionReceipt {
  assistId: string;
  status: SuggestionStatus;
  /**
   * WHO has to say yes. `seo.keyword_meaning_suggest` addresses every proposal
   * to the SITE'S OWNER, which is not always the person who made it — an editor
   * on someone else's site proposes a rule and then waits for them. Carrying the
   * addressee back is what lets the UI say so, instead of telling that editor to
   * "approve it below" next to an empty list (found live on datadestruction.com,
   * 2026-08-24).
   */
  addressee: string | null;
}

/**
 * PROPOSE, never write (P12). The proposal lands as a `platform.assists` row
 * addressed to the site's OWNER and shows up in that person's keyword-meaning
 * approval queue; until they accept it, the next agent run cannot see it and
 * nothing about the site has changed.
 *
 * There is deliberately no "apply" here: approval replays the proposal through
 * the ORDINARY HUMAN WRITE PATH in `suggestions/apply.ts`.
 */
export async function proposeKeywordMeaning(input: {
  siteId: string;
  proposal: KeywordMeaningProposal;
  title: string;
  body?: string | null;
  reasoning?: string | null;
  confidence?: number | null;
  provenance?: Record<string, string>;
}): Promise<SuggestionReceipt> {
  const response = await (await seoDb()).rpc("keyword_meaning_suggest", {
    p_site_id: input.siteId,
    p_proposal: input.proposal,
    p_title: input.title,
    ...(input.body ? { p_body: input.body } : {}),
    ...(input.reasoning ? { p_reasoning: input.reasoning } : {}),
    ...(input.confidence != null ? { p_confidence: input.confidence } : {}),
    ...(input.provenance
      ? { p_provenance: input.provenance }
      : {}),
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "put that rule change in front of you to approve",
  );
  const row = rows?.[0];
  if (!row) {
    throw new Error(
      "The proposal was accepted but came back empty — reload the page before approving anything.",
    );
  }
  return {
    assistId: row.assist_id,
    status: row.status as SuggestionStatus,
    addressee: row.addressee ?? null,
  };
}

/* ------------------------------------------------ KI-032: human rulings read */

/** One HUMAN ruling on a dimension — the thing the blind check argues with. */
export interface HumanRulingRow {
  keywordId: string;
  keyword: string;
  clicks: number;
  impressions: number;
  valueId: string;
  valueSlug: string;
  valueLabel: string;
  /** The reason the person typed when they ruled (P24), when they did. */
  reason: string | null;
  pinned: boolean;
  ruledAt: string;
  ruledTotal: number;
}

/**
 * This site's HUMAN rulings on one dimension, demand-ordered — the verify
 * loop's ONE read (`seo.gsc_human_rulings`, KI-032).
 */
export async function listHumanRulings(input: {
  siteId: string;
  dimensionSlug: string;
  start: string;
  end: string;
  limit?: number;
}): Promise<HumanRulingRow[]> {
  const response = await (await seoDb()).rpc("gsc_human_rulings", {
    p_site_id: input.siteId,
    p_dimension_slug: input.dimensionSlug,
    p_start: input.start,
    p_end: input.end,
    ...(input.limit ? { p_limit: input.limit } : {}),
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    "read your rulings for the blind check",
  );
  return (rows ?? []).map((row) => ({
    keywordId: String(row.keyword_id),
    keyword: String(row.keyword),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    valueId: String(row.value_id),
    valueSlug: String(row.value_slug),
    valueLabel: String(row.value_label),
    reason: row.reason == null ? null : String(row.reason),
    pinned: row.pinned === true,
    ruledAt: String(row.ruled_at),
    ruledTotal: Number(row.ruled_total ?? 0),
  }));
}
