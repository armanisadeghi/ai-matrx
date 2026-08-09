/**
 * Surface manifest — Research workspace (`matrx-user/research`).
 *
 * Drives every route under `/research` — the landing, the topic list, the
 * creation wizard, and (the real workspace) `/research/topics/[topicId]` with
 * its ~20 sub-routes: overview/orchestra, sources, curate, content, keywords,
 * analysis, synthesis, document(s), tags, context, outputs, costs, settings.
 *
 * A research topic is the entity (`research.rs_topic`); everything else
 * (keywords, sources, content, analyses, syntheses, documents, tags, media) is
 * a component of it. The pipeline runs search → scrape → analyze → synthesize
 * → document, and the workspace is a live view of BOTH lifetime DB progress
 * and the current run.
 *
 * The load-bearing distinction agents must understand here:
 *   - COUNTS (`pipeline_progress`) say what exists.
 *   - READINESS (`readiness`, `pending_ledger`) says what is still OWED. Counts
 *     alone cannot answer "is this topic done?" — a topic with data at every
 *     stage can still have a whole keyword that was never searched. Every
 *     `pending_ledger` field mirrors a real gate in the aidream orchestrator,
 *     so an agent that reads it never proposes work the pipeline would refuse.
 *   - QUOTAS (`topic_quotas`, `quota_headroom`) are hard backend caps. A zero
 *     in `quota_headroom` means the next add of that kind is silently dropped
 *     unless the cap is raised first.
 *
 * Runtime scope assembly lives in
 * `features/research/agent-context/buildResearchContextData.ts` — the ONE pure
 * state→scope mapper, consumed by the topic shell's `SurfaceRuntimeProvider`
 * (`app/(core)/research/topics/[topicId]/ResearchTopicShell.tsx`) and by every
 * context-menu mount (the wizard subject input, the document viewer, the
 * synthesis cards).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "topic_identity",
    label: "Topic identity",
    sortOrder: 100,
    description:
      "Which research topic is open, who owns it, and where the user is inside it.",
  },
  {
    key: "pipeline_state",
    label: "Pipeline state",
    sortOrder: 200,
    description:
      "What the pipeline has produced (counts) and what it still owes (readiness).",
  },
  {
    key: "material",
    label: "Gathered material",
    sortOrder: 300,
    description:
      "The keywords, sources, scraped content, analyses, and tags collected for the topic.",
  },
  {
    key: "outputs",
    label: "Outputs",
    sortOrder: 400,
    description:
      "Syntheses, the assembled document(s), and the topic's suggested/declared output formats.",
  },
  {
    key: "quotas",
    label: "Quotas",
    sortOrder: 500,
    description:
      "The topic's hard per-stage caps and the headroom remaining under each.",
  },
  {
    key: "configuration",
    label: "Configuration",
    sortOrder: 600,
    description:
      "How this topic's pipeline is configured: search provider/params, agent config, tone.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Topic identity ────────────────────────────────────────────────────
  {
    name: "topic_id",
    label: "Topic ID",
    description:
      "UUID of the research topic being viewed (`research.rs_topic.id`). Empty on the research landing, the topic list, and the creation wizard — no topic row exists yet there.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "topic_identity",
    sortOrder: 300,
  },
  {
    name: "topic_name",
    label: "Topic name",
    description:
      "Title of the active research topic. In the creation wizard this is the draft name the user is typing. Empty when neither exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    group: "topic_identity",
    sortOrder: 310,
  },
  {
    name: "topic_description",
    label: "Topic description",
    description:
      "The research question / structured description for the topic (draft text in the wizard). Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "topic_identity",
    sortOrder: 320,
  },
  {
    name: "organization_id",
    label: "Organization ID",
    description:
      "UUID of the organization that owns the topic (`rs_topic.organization_id`) — tenancy is org + creator, never a project. Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "topic_identity",
    sortOrder: 322,
  },
  {
    name: "topic_visibility",
    label: "Visibility",
    description:
      "Access tier of the topic row: personal, internal, or public. Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "topic_identity",
    sortOrder: 324,
  },
  {
    name: "template_id",
    label: "Template ID",
    description:
      "UUID of the `rs_template` this topic was created from, when one was used. Empty for topics created from scratch or when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "topic_identity",
    sortOrder: 326,
  },
  {
    name: "topic_created_at",
    label: "Created at",
    description:
      "ISO timestamp the topic row was created. Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    group: "topic_identity",
    sortOrder: 328,
  },
  {
    name: "topic_updated_at",
    label: "Updated at",
    description:
      "ISO timestamp of the last write to the topic row. Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    group: "topic_identity",
    sortOrder: 329,
  },
  {
    name: "active_view",
    label: "Active view",
    description:
      'Which sub-route of the topic workspace the user is on — "overview", "sources", "curate", "keywords", "analysis", "synthesis", "document", "tags", "context", "outputs", "costs", "settings", … Empty outside a topic workspace.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "topic_identity",
    sortOrder: 335,
  },

  // ── Pipeline state ────────────────────────────────────────────────────
  {
    name: "topic_status",
    label: "Topic status",
    description:
      '"draft", "searching", "scraping", "curating", "analyzing", or "complete". Empty when no topic is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "pipeline_state",
    sortOrder: 400,
  },
  {
    name: "autonomy_level",
    label: "Autonomy level",
    description:
      '"auto", "semi", or "manual" — how much of the pipeline runs without user intervention. Empty when no topic is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "pipeline_state",
    sortOrder: 410,
  },
  {
    name: "pipeline_progress",
    label: "Pipeline progress",
    description:
      "The composite lifetime counter object from `get_topic_overview`: keywords, sources (total/included/by status), content, analyses (total/eligible/failed), keyword + topic syntheses, tags, documents. Mirrors the individual count values as one object (completeness law). Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    group: "pipeline_state",
    sortOrder: 420,
  },
  {
    name: "readiness",
    label: "Stage readiness",
    description:
      "Per-stage derived readiness (`deriveReadiness`): for each of keywords/sources/content/analysis/synthesis/report/document a status of empty | ready | behind | stale plus its reason. This — not the raw counts — is what says whether a stage is finished. Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "pipeline_state",
    sortOrder: 430,
  },
  {
    name: "pending_ledger",
    label: "Pending work ledger",
    description:
      "The raw readiness ledger from `get_topic_overview`: keywords_unsearched / pending_scrape / pending_analysis / pending_synthesis, report_stale, document_stale, and the four *_slots_remaining figures. Every field mirrors a real orchestrator gate. Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    group: "pipeline_state",
    sortOrder: 440,
  },
  {
    name: "runnable_summary",
    label: "Runnable work summary",
    description:
      'One-line human summary of the outstanding work a pipeline run would actually do (e.g. "1 keyword never searched"). Empty when nothing is runnable or no topic is open. Report/document staleness is deliberately NOT runnable work.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "pipeline_state",
    sortOrder: 450,
  },
  {
    name: "report_stale",
    label: "Report out of date",
    description:
      "True when the topic report was written before the newest current keyword synthesis. Not runnable work — updating or rebuilding the report is an explicit user decision. Empty when no topic is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pipeline_state",
    sortOrder: 460,
  },
  {
    name: "document_stale",
    label: "Document out of date",
    description:
      "True when the assembled document was written before the newest current topic report. Document assembly is explicit-only (never auto-run). Empty when no topic is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pipeline_state",
    sortOrder: 470,
  },

  // ── Gathered material ─────────────────────────────────────────────────
  {
    name: "keyword_list",
    label: "Keywords",
    description:
      "Array of the keyword strings driving the topic's searches (the wizard's draft strings before a topic exists). Empty when the surface has not loaded keywords — the topic shell emits counts only; keyword-bearing mounts emit the list.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "material",
    sortOrder: 500,
  },
  {
    name: "keyword_count",
    label: "Keyword count",
    description:
      "Total keywords on the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "material",
    sortOrder: 505,
  },
  {
    name: "source_count",
    label: "Source count",
    description:
      "Total sources discovered for the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "material",
    sortOrder: 510,
  },
  {
    name: "included_source_count",
    label: "Included source count",
    description:
      "Number of non-excluded sources retained for analysis after curation. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "material",
    sortOrder: 515,
  },
  {
    name: "sources_by_status",
    label: "Sources by scrape status",
    description:
      "Map of scrape status → source count (pending / success / failed / skipped …) for the topic. Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    group: "material",
    sortOrder: 520,
  },
  {
    name: "content_count",
    label: "Scraped content count",
    description:
      "Number of `rs_content` rows (successfully read pages) for the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "material",
    sortOrder: 525,
  },
  {
    name: "analysis_count",
    label: "Analysis count",
    description:
      "Number of completed per-page content analyses for the topic. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "material",
    sortOrder: 530,
  },
  {
    name: "failed_analysis_count",
    label: "Failed analyses",
    description:
      "Number of page analyses that failed. A failed call still burned tokens — it is excluded from the billed total but reported as wasted spend. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "material",
    sortOrder: 535,
  },
  {
    name: "tag_count",
    label: "Tag count",
    description:
      "Number of tags on the topic. Tags are MANUAL — the pipeline never generates them. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "material",
    sortOrder: 540,
  },

  // ── Outputs ───────────────────────────────────────────────────────────
  {
    name: "current_synthesis_text",
    label: "Current synthesis",
    description:
      "Body of the most recent current topic-level synthesis (the report) as displayed. Empty when no synthesis exists yet or the mount is not showing one. Bindable-only: the same text already rides in the baseline `content` on the mounts that display it, so it is not auto-added to context.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "outputs",
    sortOrder: 600,
  },
  {
    name: "synthesis_documents",
    label: "Synthesis documents",
    description:
      "Array of `{ id, title, created_at }` for the generated research documents the mount has loaded. Empty when none or the mount does not list documents.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "outputs",
    sortOrder: 610,
  },
  {
    name: "document_count",
    label: "Document count",
    description:
      "Number of assembled document versions for the topic. Zero when none has ever been generated (generation is explicit-only) or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "outputs",
    sortOrder: 615,
  },
  {
    name: "keyword_synthesis_count",
    label: "Keyword syntheses",
    description:
      "Number of current per-keyword syntheses. Capped topic-wide by `max_keyword_syntheses`, so a fully-analyzed keyword can still lack one. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "outputs",
    sortOrder: 620,
  },
  {
    name: "topic_synthesis_count",
    label: "Topic syntheses",
    description:
      "Number of current topic-wide syntheses (reports). Only ONE can be live at a time — a rewrite supersedes the previous version rather than coexisting. Zero when none or no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "outputs",
    sortOrder: 625,
  },
  {
    name: "tag_suggestions",
    label: "Tag suggestions",
    description:
      "The stored tag-suggestion bundle on the topic row (suggested tag names + rationale from an auto-tag call). Empty when no auto-tag call has run or no topic is open. Bindable-only — rarely needed in general agent context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    group: "outputs",
    sortOrder: 630,
  },
  {
    name: "outputs_config",
    label: "Outputs configuration",
    description:
      "The topic row's `outputs` JSON — the declared publishing formats (podcast, blog, slides, SEO …) and their settings. Empty when unset or no topic is open. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    group: "outputs",
    sortOrder: 640,
  },

  // ── Quotas ────────────────────────────────────────────────────────────
  {
    name: "topic_quotas",
    label: "Topic quotas",
    description:
      "The topic's hard caps: max_keywords, scrapes_per_keyword, analyses_per_keyword, max_keyword_syntheses, max_topic_syntheses, max_documents, max_tag_consolidations, max_auto_tag_calls, videos_per_keyword. These are enforced by the backend — never assume work will happen past a cap. Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    group: "quotas",
    sortOrder: 700,
  },
  {
    name: "quota_headroom",
    label: "Quota headroom",
    description:
      "Remaining slots under each cap: keyword_slots_remaining, keyword_synthesis_slots_remaining, topic_synthesis_slots_remaining, document_slots_remaining. A ZERO means the next add of that kind is silently dropped unless the cap is raised first — say so rather than promising the work. Empty when no topic is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "quotas",
    sortOrder: 710,
  },

  // ── Configuration ─────────────────────────────────────────────────────
  {
    name: "default_search_provider",
    label: "Search provider",
    description:
      "The provider the topic's searches run through (e.g. serper, brave). Empty when no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "configuration",
    sortOrder: 800,
  },
  {
    name: "default_search_params",
    label: "Search parameters",
    description:
      "The topic's default search parameter JSON (result counts, locale, date filters …). Empty when unset or no topic is open. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    group: "configuration",
    sortOrder: 810,
  },
  {
    name: "agent_config",
    label: "Agent configuration",
    description:
      "The topic's `agent_config` JSON — which agents/models the pipeline stages use. Empty when defaults apply or no topic is open. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    group: "configuration",
    sortOrder: 820,
  },
  {
    name: "tone_profile",
    label: "Tone profile",
    description:
      "The writing-tone instruction applied to generated syntheses and documents for this topic. Empty when unset or no topic is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "configuration",
    sortOrder: 830,
  },
  {
    name: "good_scrape_threshold",
    label: "Good-scrape threshold",
    description:
      "Minimum character count a scraped page must reach to count as a good read (and become eligible for analysis). Empty when no topic is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "configuration",
    sortOrder: 840,
  },
  {
    name: "topic_metadata",
    label: "Topic metadata",
    description:
      "The topic row's free-form `metadata` JSON. Empty when unset or no topic is open. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    group: "configuration",
    sortOrder: 850,
  },
];

/**
 * The WRITE half — what an agent may change on the topic workspace.
 *
 * The judgment line here is money. Framing a topic is exactly a research
 * agent's job: the description IS the research question, keywords ARE the
 * search plan, and both are authored text an agent drafts better and faster
 * than a human typing into a form. Anything that SPENDS — kicking off a
 * search, a scrape, an analysis pass, or the document assembly that this
 * feature's own doctrine calls its most expensive operation — is deliberately
 * NOT a target. An agent may shape what the pipeline would research; only a
 * human starts it.
 *
 * Every target is `mode: "entity"`, because the topic workspace has no draft
 * layer to stage into: the shell (`ResearchTopicShell`) wraps `TopicProvider`,
 * whose store holds the SERVER's topic row and exposes only `setTopic` /
 * `setProgress`. `TopicSettingsForm`'s local form state is one sub-route's
 * private buffer, and an agent run launches from the header on ANY of the ~20
 * sub-routes — a "staged" value the user cannot see from where they are
 * standing is worse than no value. So these persist through the canonical
 * service and every one of them is `applyPolicy: "ask"`: the write lands in
 * the database the moment it is applied, so the user confirms first, in place.
 *
 * `add_keywords` additionally clears the feature's quota gate BEFORE it writes
 * (`evaluateKeywordQuota`) — `max_keywords` and `max_keyword_syntheses` are
 * hard backend caps, and a keyword written past one is silently never
 * researched. The handler refuses with the shortfall spelled out rather than
 * raising a paid cap on the user's behalf; raising it stays a human decision
 * through `KeywordQuotaDialog` on the keywords page.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "topic_description",
    label: "Topic description",
    description:
      "Set the topic's description — the research question that frames every downstream prompt. Value: a plain string that REPLACES the whole description (read topic_description first and include anything worth keeping); an empty string clears it. Persists immediately to research.rs_topic through updateTopicMeta.",
    valueType: "string",
    updatesValue: "topic_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "topic_identity",
    sortOrder: 100,
  },
  {
    name: "topic_name",
    label: "Topic name",
    description:
      "Rename the research topic. Value: a non-empty plain string that replaces the current title. Persists immediately to research.rs_topic through updateTopicMeta. This is the topic's display title only — it does not change the research question (topic_description) or anything the pipeline has already produced.",
    valueType: "string",
    updatesValue: "topic_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "topic_identity",
    sortOrder: 110,
  },
  {
    name: "add_keywords",
    label: "Add keywords",
    description:
      "ADD one or more search keywords to the topic. Value: an array of keyword strings, in priority order. Additive — it never removes or reorders existing keywords, so send only the NEW ones (read keyword_list / keyword_count first). Blank and duplicate entries are dropped. Each keyword is created immediately under the topic through the canonical addKeywords path and inherits the topic's organization and default search provider/params. Adding a keyword does NOT search it — the pipeline is still started by the user. REFUSED, with the shortfall named, when the resulting keyword count would exceed the topic's max_keywords or max_keyword_syntheses cap: past either one the pipeline silently never researches or never writes up the extra keywords, and raising a cap is the user's decision (check quota_headroom before proposing).",
    valueType: "array",
    updatesValue: "keyword_list",
    mode: "entity",
    applyPolicy: "ask",
    group: "material",
    sortOrder: 120,
  },
  {
    name: "autonomy_level",
    label: "Autonomy level",
    description:
      'Set how much of the pipeline runs without user intervention. Value: exactly one of "auto" (every stage chains end-to-end once a run starts), "semi" (pauses at key junctions — after search, after analysis — so the user can prune sources before the next stage), or "manual" (nothing advances without an explicit click). Persists immediately to research.rs_topic through updateTopic. This sets the POLICY for a future run; it never starts one.',
    valueType: "string",
    updatesValue: "autonomy_level",
    mode: "entity",
    applyPolicy: "ask",
    group: "pipeline_state",
    sortOrder: 130,
  },
];

export const researchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/research",
  readiness: "verified",
  label: "Research",
  urlPattern: "/research/topics/[topicId]",
  intro: `<surface_intro>
You are on the Research workspace: one research topic and everything the pipeline has gathered for it. The pipeline runs search -> scrape -> analyze -> synthesize -> document, with human curation in between.
Read the values in three layers, and never confuse them. COUNTS (pipeline_progress and the individual *_count values) say what EXISTS. READINESS (readiness, pending_ledger, runnable_summary) says what is still OWED — a topic can have data at every stage and still have a whole keyword that was never searched, so judge "is this done?" from readiness, never from counts. QUOTAS (topic_quotas, quota_headroom) are hard backend caps: a zero in quota_headroom means the next keyword, synthesis, or document is silently dropped unless the cap is raised first, so say that instead of promising the work.
report_stale and document_stale are deliberately NOT runnable work: a pipeline run will not rewrite the report and never assembles a document. Each is an explicit user decision, and document assembly is the most expensive operation here — never imply it happens automatically.
The material itself (keywords, sources, scraped content, page analyses, syntheses, documents, tags, media) is selectable agent input through the topic's Context Builder and saved context bundles; this surface hands you the topic's shape and state, not its full corpus. Tags are manual — the pipeline never creates them.
current_synthesis_text is the report the user is reading when a synthesis mount is active; the baseline content value carries whatever body is on screen.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One generated research document, as emitted in `synthesis_documents`. */
export interface ResearchDocumentEntry {
  id: string;
  title: string;
  created_at?: string;
}

/**
 * Type-safe payload helper for the Research surface.
 *
 * NOTHING is `alwaysAvailable`: the `/research` prefix covers the landing, the
 * topic list, and the creation wizard as well as the topic workspace, and the
 * wizard emits this scope before a topic row exists. So every key is optional.
 */
export function createResearchScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  // Topic identity
  topic_id?: string;
  topic_name?: string;
  topic_description?: string;
  organization_id?: string;
  topic_visibility?: string;
  template_id?: string;
  topic_created_at?: string;
  topic_updated_at?: string;
  active_view?: string;
  // Pipeline state
  topic_status?: string;
  autonomy_level?: string;
  pipeline_progress?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
  pending_ledger?: Record<string, unknown>;
  runnable_summary?: string;
  report_stale?: boolean;
  document_stale?: boolean;
  // Gathered material
  keyword_list?: string[];
  keyword_count?: number;
  source_count?: number;
  included_source_count?: number;
  sources_by_status?: Record<string, number>;
  content_count?: number;
  analysis_count?: number;
  failed_analysis_count?: number;
  tag_count?: number;
  // Outputs
  current_synthesis_text?: string;
  synthesis_documents?: ResearchDocumentEntry[];
  document_count?: number;
  keyword_synthesis_count?: number;
  topic_synthesis_count?: number;
  tag_suggestions?: Record<string, unknown>;
  outputs_config?: Record<string, unknown>;
  // Quotas
  topic_quotas?: Record<string, unknown>;
  quota_headroom?: Record<string, unknown>;
  // Configuration
  default_search_provider?: string;
  default_search_params?: Record<string, unknown>;
  agent_config?: Record<string, unknown>;
  tone_profile?: string;
  good_scrape_threshold?: number;
  topic_metadata?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
