// features/research/browse/types.ts
//
// The research TOPICS list (/research/topics) as a canonical entity list.
// One row = one `research.rs_topic`, read directly with the columns the list
// shows, plus its project (a `research_topic → project` association edge —
// never a topic column; `rs_topic.project_id` is dead).

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

type TopicRow = Database["research"]["Tables"]["rs_topic"]["Row"];

export type ResearchTopicListRow = Pick<
  TopicRow,
  | "id"
  | "name"
  | "description"
  | "status"
  | "autonomy_level"
  | "organization_id"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "template_id"
> & {
  /** The topic's project, from its association edge. Null when it has none. */
  project_id: string | null;
  project_name: string | null;
};

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
