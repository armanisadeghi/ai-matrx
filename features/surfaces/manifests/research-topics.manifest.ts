/**
 * Surface manifest — Research topics list (`matrx-user/research-topics`).
 *
 * The /research/topics LIST: every research topic the person can see, in the
 * scope, search, filters and sort they chose. It is its own surface because the
 * workspace surface (`matrx-user/research`) describes ONE open topic — its
 * pipeline, readiness and quotas — and a list page can emit none of that; on
 * the list an agent needs the list.
 *
 * Read half: `topic_list` is the condensed visible page as ONE XML bundle
 * (shown up front, ~4,000 chars); `topics` carries the same rows in full as a
 * lookup value; the rest describe the query (scope, search, filters, totals).
 *
 * Write half: full CRUD over topics, all `ask`, each through the page's own
 * path — `create_topics` (createTopic, the same insert the New topic wizard
 * makes, organization chosen through the organization gate), `update_topics`
 * (updateTopicMeta / updateTopic) and `delete_topics` (the same soft delete as
 * the row menu). Nothing here STARTS research: a search, scrape or analysis
 * spends money and stays a human click on the topic's own page.
 *
 * Emitter: `features/research/browse/surface.ts`, mounted by the canonical
 * list shell (`TopicsListPage` → `EntityListPage surface=…`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const RESEARCH_TOPICS_SURFACE_NAME = "matrx-user/research-topics";

const groups: SurfaceValueGroup[] = [
  {
    key: "topics",
    label: "Topics",
    sortOrder: 100,
    description: "The research topics the list shows, condensed and in full.",
  },
  {
    key: "list_query",
    label: "List view",
    sortOrder: 200,
    description: "Which topics the list is showing: scope, search, filters, totals.",
  },
];

const TOPIC_SHAPE =
  "{ id, name, description, status, autonomy_level, project_id, project_name, organization_id, created_at, updated_at }";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "topic_list",
    label: "Topic list",
    description:
      'The page of topics on screen, in the person\'s order, as one XML bundle: <topics scope total shown?> with one <topic id status project updated> per row whose text is the topic name, and a <question> child holding its description (the research question), clipped to 240 chars with clipped="true" when cut. Use the ids with update_topics / delete_topics and to open a topic at /research/topics/<id>. Absent while the list loads; an empty <topics total="0"/> when nothing matches.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    inlineUpTo: 4000,
    sortOrder: 100,
    group: "topics",
  },
  {
    name: "topics",
    label: "Topics (full rows)",
    description: `The same page of topics with every field, as an array of ${TOPIC_SHAPE}. status is one of draft, searching, scraping, curating, analyzing, complete; autonomy_level is auto, semi or manual. Absent while loading; [] when the page is empty.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 110,
    group: "topics",
  },
  {
    name: "total_count",
    label: "Matching topics",
    description:
      "How many topics match the current scope, search and filters (all pages). Absent while loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 200,
    group: "list_query",
  },
  {
    name: "list_scope",
    label: "Scope",
    description:
      '"mine" (topics the person started) or "orgs" (every topic their organizations hold). When narrowed to one organization, list_scope_organization_id names it.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "list_query",
  },
  {
    name: "list_scope_organization_id",
    label: "Scope organization",
    description:
      "The one organization the My orgs tab is narrowed to. Absent when the list is not narrowed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 215,
    group: "list_query",
  },
  {
    name: "scope_counts",
    label: "Scope counts",
    description:
      "Topic totals per scope tab as { mine, orgs }, for the current search. Absent while the counts load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 220,
    group: "list_query",
  },
  {
    name: "search_query",
    label: "Search",
    description:
      "What is typed in the search box (matches topic names and descriptions). Empty string when nothing is typed.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 230,
    group: "list_query",
  },
  {
    name: "active_filters",
    label: "Filters",
    description:
      'The column filters in force, keyed by column: status / autonomy_level / project / organization_name take { kind: "select", values: [...] } (project values are project ids, "__none__" = no project; organization_name values are organization ids); updated_at / created_at take bucket values "1h", "24h", "7d", "30d", "90d", "1y"; name takes { kind: "text", value }. {} when none.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 240,
    group: "list_query",
  },
  {
    name: "sort",
    label: "Sort",
    description:
      'The list order as "<column>-<asc|desc>", e.g. "updated_at-desc" (newest first).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 250,
    group: "list_query",
  },
];

const TOPIC_FIELDS =
  'name: string (the topic\'s title, required when creating), description?: string (the research question every downstream step works from — write it as the question to answer), autonomy_level?: "auto" | "semi" | "manual" (how far a run goes on its own; default "semi")';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_topics",
    label: "Create topics",
    description: `Creates one or more research topics, saved immediately, exactly as the New topic page does. Value is a JSON ARRAY (not a string) of 1-10 objects, each { ${TOPIC_FIELDS} }, e.g. [{ "name": "EV battery recycling", "description": "Which EV battery recycling methods are commercially viable in the US in 2026?" }]. The topic lands in the person's active organization (they are asked to choose one if none is active). Creating a topic does NOT start any research — no search, reading or analysis runs, nothing is spent; the person starts it on the topic's page. Every entry is checked first: a missing name, an unknown autonomy_level or a repeated name refuses the whole list with nothing created. Returns the new topics' ids.`,
    valueType: "array",
    updatesValue: "topics",
    mode: "entity",
    applyPolicy: "ask",
    group: "topics",
    sortOrder: 100,
  },
  {
    name: "update_topics",
    label: "Update topics",
    description: `Changes one or more topics by id, saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { id: string (from topics / topic_list), name?, description?, autonomy_level? } with the fields read as in create_topics. Only the fields you send change. description REPLACES the whole research question; send "" to clear it. name may not be empty. An unknown or repeated id, or no field to change, refuses the whole list with nothing changed. Changing a topic never starts or re-runs research.`,
    valueType: "array",
    updatesValue: "topics",
    mode: "entity",
    applyPolicy: "ask",
    group: "topics",
    sortOrder: 110,
  },
  {
    name: "delete_topics",
    label: "Delete topics",
    description:
      'Removes one or more topics from the list. Value is a JSON ARRAY (not a string) of topic ids, or of { id } objects, from topics / topic_list, e.g. ["…"]. What happens: the topic and its sources, analyses, reports and documents disappear from the person\'s list and every screen for everyone in the organization; the data stays in the database and only an admin can restore it — nothing on this page undoes it. Use it only when the person asks to delete (a duplicate, a topic made by mistake). Unknown or repeated ids refuse the whole list, with nothing deleted.',
    valueType: "array",
    updatesValue: "topics",
    mode: "entity",
    applyPolicy: "ask",
    group: "topics",
    sortOrder: 120,
  },
];

export const researchTopicsManifest: SurfaceManifest = {
  surfaceName: RESEARCH_TOPICS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Research topics list (/research/topics): the visible topics, scope, search and filters; create, update and delete topics.",
  readiness: "partial",
  readinessNote:
    "Proven live 2026-09-27 on a52ad38f28: surface:probe pass (6/14 supplied, nothing undeclared, menu opens) and a Badass Agent run that created two PP test topics in one approval, renamed one and deleted the other, each row read back with SQL. Not yet verified: the server-side rsx_* list (dedb38550e) awaits its release, and no valueKind is named on the targets.",
  label: "Research topics",
  urlPattern: "/research/topics",
  intro: `<surface_intro>
You are on the Research topics list at /research/topics. A research topic is a question worth answering; opening one (/research/topics/<id>) runs search -> read -> analyze -> report on it. topic_list is the page on screen (condensed, in the person's order); topics has the same rows with every field; total_count, list_scope, search_query, active_filters and sort say what the list is showing.

Changes go through three targets, each a JSON array the person approves once:
- create_topics — start new topics (name + the research question as description). Creating never starts research or spends anything.
- update_topics — rename, rewrite the research question, or change autonomy, by id.
- delete_topics — remove topics by id; only an admin can restore them, so use it only when asked.
Starting, re-running or stopping research is not possible from this list: tell the person to open the topic.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** One entry of `topics`. */
export interface ResearchTopicScopeEntry {
  id: string;
  name: string;
  description: string | null;
  status: string;
  autonomy_level: string;
  project_id: string | null;
  project_name: string | null;
  organization_id: string;
  created_at: string | null;
  updated_at: string | null;
}

/** Type-safe payload helper; required keys mirror `alwaysAvailable: true`. */
export function createResearchTopicsScope(values: {
  list_scope: string;
  search_query: string;
  active_filters: Record<string, unknown>;
  sort: string;
  selection?: string;
  context?: Record<string, unknown>;
  topic_list?: string;
  topics?: ResearchTopicScopeEntry[];
  total_count?: number;
  list_scope_organization_id?: string;
  scope_counts?: { mine?: number; orgs?: number };
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
