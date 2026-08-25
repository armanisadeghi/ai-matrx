/**
 * ONE QUESTION, FIVE KEYWORDS — the data half.
 *
 * The ruling session asks everything about one keyword. This asks one thing
 * about five, because the expensive part of answering is loading the question
 * into your head, not picking the value. Arman, 2026-08-25: *"imagine if we
 * have a window panel version of this that defaults to, like, five keywords,
 * and it tries to dedupe for words that are in common… a few of them that have
 * a lot of clicks, a few that have a lot of impressions."*
 *
 * 🚨 THIS MODULE OPENS NO WRITE PATH OF ITS OWN — the same rule the ruling
 * session's data layer follows. Answers go through `setKeywordStamps`, the one
 * function every other surface calls.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/REGISTER.md KI-051
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

const assertData = makeAssertData("load the next batch of questions");

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

export interface BatchKeyword {
  keywordId: string;
  keyword: string;
  clicks: number;
  impressions: number;
  /** Which end of demand put this one in the batch — 'clicks' or 'impressions'. */
  pickedFor: "clicks" | "impressions";
}

export interface BatchQuestion {
  /** Null when the site has no dimension worth asking about. */
  dimensionSlug: string | null;
  dimensionLabel: string | null;
  /** The server's sentence for why THIS question, rendered as-is. */
  why: string | null;
  keywords: BatchKeyword[];
  /** How many keywords on this site still have no answer for this dimension. */
  remaining: number;
}

interface BatchRow {
  dimension_slug: string;
  dimension_label: string;
  dimension_why: string | null;
  keyword_id: string;
  keyword: string;
  clicks: number;
  impressions: number;
  picked_for: string;
  remaining: number;
}

/**
 * `dimension` names the question when the person picked one; otherwise the
 * server chooses — worth-carrying dimensions first, emptiest-answered first.
 * `exclude` carries the keywords already shown, so pressing on never re-asks.
 */
export async function getBatchQuestion(
  siteId: string,
  options: {
    dimension?: string | null;
    size?: number;
    exclude?: string[];
    signal?: AbortSignal;
  } = {},
): Promise<BatchQuestion> {
  const query = (await seoDb())
    .rpc("gsc_batch_question", {
      p_site_id: siteId,
      p_dimension: options.dimension ?? undefined,
      p_size: options.size ?? 5,
      p_exclude: options.exclude?.length ? options.exclude : undefined,
    })
    .returns<BatchRow[]>();
  const response = options.signal
    ? await query.abortSignal(options.signal)
    : await query;
  const rows = assertData(response.data, response.error, "load the questions");

  if (!rows || rows.length === 0) {
    return {
      dimensionSlug: null,
      dimensionLabel: null,
      why: null,
      keywords: [],
      remaining: 0,
    };
  }
  return {
    dimensionSlug: rows[0].dimension_slug,
    dimensionLabel: rows[0].dimension_label,
    why: rows[0].dimension_why,
    remaining: Number(rows[0].remaining ?? 0),
    keywords: rows.map((row) => ({
      keywordId: row.keyword_id,
      keyword: row.keyword,
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      pickedFor: row.picked_for === "clicks" ? "clicks" : "impressions",
    })),
  };
}
