/**
 * Topic Tree Builder — data layer.
 *
 * Arman's original ask, in his words: "have keywords have this parent child
 * relationship in terms of how they relate to this particular client or
 * company… a big part of that parent child relationship is to pin the top
 * parent… which is always a service or product. It's something you're trying
 * to sell." And the reason it matters: traffic that never reaches a service or
 * product "is purely there for improving your authority… you're never gonna
 * make more money from it."
 *
 * Split of responsibility, same as `../data.ts`:
 *   - Anything that touches the keyword corpus or GSC facts goes through a
 *     SECURITY DEFINER RPC guarded by `seo.gsc_assert_site_access` (THE 8s LAW
 *     — this feature has already been killed once by the authenticated role's
 *     statement timeout; see migrations/seo_keyword_value_map_windowed.sql).
 *   - `seo.topic` is a small shared table (330 rows) read directly under RLS.
 *   - Every WRITE is an RPC: `seo.topic` is globally owned (created_by NULL,
 *     visibility public), so the std_update policy refuses browser writes by
 *     construction, and the cycle guard belongs in the DB anyway.
 *
 * Never re-derive a band or a score here — render what the resolver returns.
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { SiteTopicValue, TopicNode } from "../types";
import type {
  OfferingSplitRow,
  TopicStatRow,
  UnassignedKeywordRow,
  KeywordTopicResult,
} from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your topic tree");

/**
 * Governance rules speak for themselves — the same posture `../data.ts`
 * takes. A cycle refusal ("'CRT and TV Recycling' already sits under
 * 'Consumer Electronics Recycling' — pinning it as the parent would make a
 * loop") is the entire value of the guard; swallowing it into a generic
 * sentence turns the rule into a mystery.
 */
const GOVERNANCE_CODE =
  /^(seo_topic_[a-z_]+|gsc_no_keywords|gsc_site_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNANCE_CODE);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The whole topic catalog. It is a SHARED tree — no `site_id` — so the parent
 * picker must be able to reach every node, and a completeness read is what
 * lineage/cycle rendering depends on. Hence `readAllRows`, not a bare select.
 */
export async function listAllTopics(): Promise<TopicNode[]> {
  const db = await seoDb();
  return readAllRows<TopicNode>(
    ({ from, to }) =>
      db
        .from("topic")
        .select("id, name, slug, node_type, parent_id, description", {
          count: "exact",
        })
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "seo.topic" },
  );
}

/** This site's per-topic worth rulings. Small, site-scoped, direct under RLS. */
export async function listTopicWorth(siteId: string): Promise<SiteTopicValue[]> {
  const response = await (await seoDb())
    .from("site_topic_value")
    .select("id, site_id, topic_id, weight, lead_quality, service_match, notes")
    .eq("site_id", siteId)
    .is("deleted_at", null);
  return assertData(response.data, response.error) as SiteTopicValue[];
}

/**
 * Per-topic payoff: (topic × band) rows for every keyword whose PRIMARY topic
 * is that node. The caller rolls them up the tree — the DB deliberately
 * returns leaves so one read serves both the per-node read and the rollup.
 */
export async function getTopicStats(
  siteId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<TopicStatRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_topic_stats", { p_site_id: siteId, p_start: start, p_end: end })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as TopicStatRow[];
}

/** THE HEADLINE: traffic that can become money vs traffic that can only build authority. */
export async function getOfferingSplit(
  siteId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<OfferingSplitRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_topic_offering_split", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as OfferingSplitRow[];
}

/** The unplaced work queue, demand-ordered. */
export async function getUnassignedKeywords(
  siteId: string,
  start: string,
  end: string,
  query: { search?: string | null; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<{ rows: UnassignedKeywordRow[]; total: number }> {
  const response = await (await seoDb())
    .rpc("gsc_topic_unassigned_keywords", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      p_search: query.search ?? undefined,
      p_limit: query.limit ?? 50,
      p_offset: query.offset ?? 0,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error) as UnassignedKeywordRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

// ── Writes (all SECURITY DEFINER, all gsc_assert_site_editor) ───────────────

/** THE PINNING. `parentId = null` makes the topic a root. Cycle-guarded in the DB. */
export async function setTopicParent(
  siteId: string,
  topicId: string,
  parentId: string | null,
): Promise<string> {
  const response = await (await seoDb()).rpc("gsc_topic_set_parent", {
    p_site_id: siteId,
    p_topic_id: topicId ?? undefined,
    p_parent_id: parentId ?? undefined,
  });
  return assertGoverned(response.data, response.error, "pin the parent") as string;
}

/** Create a topic (parent travels with the create) or rename / retype one. */
export async function saveTopic(
  siteId: string,
  input: {
    topicId?: string | null;
    name?: string;
    nodeType?: string;
    description?: string | null;
    parentId?: string | null;
  },
): Promise<string> {
  const response = await (await seoDb()).rpc("gsc_topic_save", {
    p_site_id: siteId,
    p_topic_id: input.topicId ?? undefined,
    p_name: input.name ?? undefined,
    p_node_type: input.nodeType ?? undefined,
    p_description: input.description ?? undefined,
    p_parent_id: input.parentId ?? undefined,
  });
  return assertGoverned(response.data, response.error, "save the topic") as string;
}

/**
 * This site's worth for one topic. `clear` REMOVES the ruling, which is not
 * the same as weight 0 — it hands the node back to its nearest valued
 * ancestor.
 */
export async function setTopicWorth(
  siteId: string,
  topicId: string,
  input: {
    weight?: number | null;
    leadQuality?: string | null;
    serviceMatch?: string | null;
    notes?: string | null;
    clear?: boolean;
  },
): Promise<string | null> {
  const response = await (await seoDb()).rpc("gsc_set_topic_value", {
    p_site_id: siteId,
    p_topic_id: topicId ?? undefined,
    p_weight: input.weight ?? undefined,
    p_lead_quality: input.leadQuality ?? undefined,
    p_service_match: input.serviceMatch ?? undefined,
    p_notes: input.notes ?? undefined,
    p_clear: input.clear ?? false,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save this topic's worth",
  ) as string | null;
}

/**
 * Pin keywords to the tree by setting their PRIMARY topic (`topicId = null`
 * unpins). Returns the band each keyword lands in AFTER the change, straight
 * from the resolver — the payoff IS the response.
 */
export async function setKeywordPrimaryTopic(
  siteId: string,
  keywordIds: string[],
  topicId: string | null,
): Promise<KeywordTopicResult[]> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_topic", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
    p_topic_id: topicId ?? undefined,
  });
  return assertGoverned(
    response.data,
    response.error,
    "assign the topic",
  ) as KeywordTopicResult[];
}
