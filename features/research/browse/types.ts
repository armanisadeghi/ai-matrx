// features/research/browse/types.ts
//
// The research TOPICS list (/research/topics) as a canonical entity list.
// One row = one `research.rs_topic`, read through the rsx_* scoped-list RPCs
// (sort, filter, paging and counts on the server), plus its project (a
// `research_topic → project` association edge — never a topic column).

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/**
 * One row, exactly as `public.rsx_list_scoped` returns it (never hand-mirrored).
 * `project_id` / `project_name` come from the topic's `research_topic → project`
 * association edge and are null when it has none (the generator cannot express
 * a nullable OUT column); `total_count` is the filtered total.
 */
export type ResearchTopicListRow =
  Database["public"]["Functions"]["rsx_list_scoped"]["Returns"][number];

/**
 * A topic belongs to an organization (`research_topic` is registered
 * `organization`), so the list answers two questions: what did I start, and
 * what does my team have. There is no shared-with-me or public corpus for
 * research topics.
 */
export const RESEARCH_TOPIC_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs"];

export const TOPIC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  searching: "Searching",
  scraping: "Reading",
  curating: "Curating",
  analyzing: "Analyzing",
  complete: "Complete",
};

export const AUTONOMY_LABELS: Record<string, string> = {
  auto: "Automatic",
  semi: "Semi-automatic",
  manual: "Manual",
};

export function labelFor(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "Unknown";
  return map[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export function topicHref(id: string): string {
  return `/research/topics/${encodeURIComponent(id)}`;
}
