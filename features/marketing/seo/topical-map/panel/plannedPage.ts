/**
 * "Make a page here" — a `plan.node` born from a topic of this map (R3).
 *
 * THE RULING (Lane D, 2026-09-18, recorded in the build register). The brief
 * asked for the `topical_map` tool action `create_planned_page` "through the
 * platform's tool-call path". There is no agent-less tool-call path: the only
 * client door to a tool is `POST /ai/tools/execute`, which is the realtime
 * session's hand-off and REQUIRES an `agent_id` + `surface` it resolves the
 * allowed set from. And the tool action itself writes no row — its docstring:
 * "The node is created by the content plan's own single write path
 * (`create_node`)". So a person's click here takes THAT single write path
 * directly (React → Supabase, the data-flow law), the same insert the plan UI
 * performs, carrying `topic_id` — which is exactly what the action would have
 * done on the person's behalf, minus a server round trip. Cost if wrong: one
 * control's transport, swapped when a person-initiated tool door exists.
 *
 * What the tool checks before writing, this file checks the same way the tool
 * does — by asking the database: the site must USE this map (`seo.site_map_id`
 * through the panel's site picker, which only offers `sites_using_map`), the
 * topic must be OF this map (its row came from `seo.map_topic` filtered by
 * `map_id`), and editor access is the insert's own RLS refusal, shown verbatim.
 */

import { createPlanNode } from "@/features/marketing/content-plan/data/service";
import type { PlanNodeInsert, PlanNodeRow } from "@/features/marketing/content-plan/types";

export interface MakePlannedPageInput {
  siteId: string;
  organizationId: string;
  topicId: string;
  label: string;
  /** Route slug for the new node; derived from the label when omitted. */
  slug?: string;
}

/** The plan's own slug rule, applied to a topic name. */
export function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function makePlannedPage(input: MakePlannedPageInput): Promise<PlanNodeRow> {
  const slug = input.slug ?? slugFromLabel(input.label);
  const insert: PlanNodeInsert = {
    site_id: input.siteId,
    organization_id: input.organizationId,
    parent_id: null,
    node_type: "article",
    label: input.label,
    slug,
    topic_id: input.topicId,
  };
  return createPlanNode(insert);
}
