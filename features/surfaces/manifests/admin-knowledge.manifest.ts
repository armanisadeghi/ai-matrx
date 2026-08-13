/**
 * Surface manifest — Knowledge Admin (`matrx-admin/knowledge`).
 *
 * ADMIN SURFACE. Drives the `/administration/knowledge/**` family: a
 * super-admin console over five unrelated-but-co-located tools —
 * CMS Agent Activity, KG Cost, KG Inspector, the Podcasts admin CRUD, and
 * the Research System admin (templates / agent wiring / project links).
 * `/administration/knowledge` itself is a HUB LANDING (a static link
 * directory over `features/admin/constants/admin-navigation`, no live data)
 * — every value below belongs to one of the five children.
 *
 * NOTE: `/administration/knowledge/growth-loop` is DELIBERATELY EXCLUDED —
 * it is the Growth Loop pipeline map, a distinct pillar with its own
 * doctrine (`features/growth-loop/FEATURE.md`) and, if it earns one, its own
 * surface. Do not fold it into this manifest.
 *
 * What an agent bound here may safely do: read whichever child's state is
 * populated (per `knowledge_section`) and summarize, diagnose, or explain it
 * — e.g. "why is this org near its auto-RAG cap", "summarize this content
 * exception", "what's wired to the auto_tagger_agent_id slot". Nothing on
 * this surface has a write target yet; the CMS policy editor, KG-cost
 * auto-ingest toggles, podcast show/episode forms, and research-template
 * editors are all real mutation UI, but they are switches, selects, and rich
 * forms with no natural single-field write target — see readinessNote.
 *
 * NO EMITTER WIRED (readiness: stub). This manifest exists so the vocabulary
 * is bindable ahead of instrumentation; declaring it now is what the
 * surface-canonical-fleet campaign asks for (wave 2b). Wiring a
 * `<SurfaceRuntimeProvider>` per child is real, non-trivial work (five
 * different client components, several with their own filter/pagination
 * state) — left for a follow-up pass once this manifest's shape is reviewed.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_KNOWLEDGE_SURFACE_NAME = "matrx-admin/knowledge";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Knowledge navigation",
    sortOrder: 100,
    description: "Which child tool of the Knowledge admin family is active.",
  },
  {
    key: "cms_agents",
    label: "CMS agent activity",
    sortOrder: 200,
    description:
      "Fleet-wide CMS agent/human activity feed, per-site page tree, agent write policy, and the validation-exception approvals queue.",
  },
  {
    key: "kg_cost",
    label: "KG cost",
    sortOrder: 300,
    description:
      "Auto-ingest spend KPIs, per-org cost leaderboard, in-flight provider batches, and drill-down detail for a selected org or batch.",
  },
  {
    key: "kg_inspector",
    label: "KG inspector",
    sortOrder: 400,
    description:
      "Read-only browser over knowledge-graph entities, their source mentions, and the edges between them.",
  },
  {
    key: "podcasts",
    label: "Podcasts admin",
    sortOrder: 500,
    description:
      "Show list, the active show's settings and episode list, and a single episode's full record.",
  },
  {
    key: "research_system",
    label: "Research system admin",
    sortOrder: 600,
    description:
      "Research templates (including per-role agent_config wiring), the agent-wiring dashboard, and the topic/project overview.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "knowledge_section",
    label: "Knowledge section",
    description:
      'Which child of the Knowledge admin family is active: "cms_agents", "kg_cost", "kg_inspector", "podcasts_shows", "podcasts_show_detail", "podcasts_episode_detail", or "research_system". Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 100,
    group: "navigation",
  },

  // ── CMS agent activity ──────────────────────────────────────────────
  {
    name: "cms_sites",
    label: "CMS sites",
    description:
      "Every client site (id, slug, name, domain, is_active, agent_write_policy, has_data_api_key) loaded on the CMS Agent Activity page. Present only on knowledge_section=cms_agents.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 200,
    group: "cms_agents",
  },
  {
    name: "cms_activity_filter",
    label: "CMS activity filter",
    description:
      "The Activity tab's current filter: { siteId, entityType, actor }, each 'all' or a specific value. Present only on cms_agents.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 210,
    group: "cms_agents",
  },
  {
    name: "cms_activity_log",
    label: "CMS activity log",
    description:
      "The polled activity feed rows (id, created_at, actor, activity_type, description, user_email) matching cms_activity_filter. Present only on cms_agents; empty array when no matches.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    sortOrder: 220,
    group: "cms_agents",
  },
  {
    name: "cms_selected_site_id",
    label: "CMS selected site",
    description:
      "UUID of the site whose page tree/assets the Pages/Assets tabs show (defaults to the first loaded site). Present only on cms_agents.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 225,
    group: "cms_agents",
  },
  {
    name: "cms_site_pages",
    label: "CMS site page tree",
    description:
      "Pages of cms_selected_site_id (id, slug, route, title, category, page_type, is_published, has_draft, sort_order), grouped by category. Present only on cms_agents.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 230,
    group: "cms_agents",
  },
  {
    name: "cms_pending_exceptions",
    label: "CMS pending exceptions",
    description:
      "Content-validation exceptions with status 'pending' on the Approvals tab (id, rule_id, node_path, excerpt, fix_hint, severity, note). Present only on cms_agents; empty array when none are pending.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 235,
    group: "cms_agents",
  },
  {
    name: "cms_selected_site_assets",
    label: "CMS selected site assets",
    description:
      "Media assets of cms_selected_site_id (id, file_name, file_type, mime_type, file_size, alt_text, folder, used_in_pages) on the Assets tab. Present only on cms_agents.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 240,
    group: "cms_agents",
  },

  // ── KG cost ──────────────────────────────────────────────────────────
  {
    name: "kg_cost_summary",
    label: "KG cost summary",
    description:
      "The dashboard's six KPI tiles: spend_today_usd, spend_7d_usd, orgs_over_80pct, pending_batches, ner_coverage_pct, batch_savings_7d_usd. Present only on kg_cost.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 300,
    group: "kg_cost",
  },
  {
    name: "kg_cost_org_rows",
    label: "KG cost org leaderboard",
    description:
      "Per-org auto-RAG spend rows (organization_id, organization_name, daily_auto_rag_budget_usd, daily_auto_rag_cost_used_usd, percent_used, last_charge_at), up to 200. Present only on kg_cost.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 310,
    group: "kg_cost",
  },
  {
    name: "kg_cost_batch_rows",
    label: "KG cost pending batches",
    description:
      "In-flight provider batch rows (id, provider, kind, organization_name, status, est_cost_usd, poll_count, next_poll_at), up to 100. Present only on kg_cost.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    sortOrder: 320,
    group: "kg_cost",
  },
  {
    name: "kg_cost_open_org_id",
    label: "KG cost open org",
    description:
      "organization_id of the org whose detail dialog is open. Absent when no org drill-down is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 330,
    group: "kg_cost",
  },
  {
    name: "kg_cost_org_detail",
    label: "KG cost org detail",
    description:
      "Detail payload for kg_cost_open_org_id: { budget_usd, used_today_usd, window_start, daily_series, top_sources, batch_summary } plus the org's auto-RAG toggle state (enabled, indexNonPdf, suggestionSweeps). Absent when no org drill-down is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 335,
    group: "kg_cost",
  },
  {
    name: "kg_cost_open_batch_id",
    label: "KG cost open batch",
    description:
      "id of the batch whose detail dialog is open. Absent when no batch drill-down is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "kg_cost",
  },
  {
    name: "kg_cost_batch_detail",
    label: "KG cost batch detail",
    description:
      "Detail payload for kg_cost_open_batch_id: adds purpose, cost_usd, tokens_in, tokens_out, error, metadata, completed_at to the batch row. Absent when no batch drill-down is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 345,
    group: "kg_cost",
  },

  // ── KG inspector ─────────────────────────────────────────────────────
  {
    name: "kg_inspector_tab",
    label: "KG inspector tab",
    description:
      'Which of the three tabs is active: "entities", "mentions", or "edges". Present only on kg_inspector.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 400,
    group: "kg_inspector",
  },
  {
    name: "kg_inspector_selected_entity",
    label: "KG inspector selected entity",
    description:
      "The entity the admin drilled into: { id, name, kind }. Drives the Mentions tab. Absent until an entity/edge endpoint is clicked.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 405,
    group: "kg_inspector",
  },
  {
    name: "kg_entities_filter",
    label: "KG entities filter",
    description:
      "Entities tab filter/sort state: { kind, q, page, sortKey, sortDir }. Present only when kg_inspector_tab is entities.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 410,
    group: "kg_inspector",
  },
  {
    name: "kg_entities",
    label: "KG entities",
    description:
      "Entity rows matching kg_entities_filter (id, kind, canonical_name, organization_id, mention_count, source_count, confidence_avg), up to 200. Present only when kg_inspector_tab is entities.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 415,
    group: "kg_inspector",
  },
  {
    name: "kg_mentions",
    label: "KG entity mentions",
    description:
      "Source mentions of kg_inspector_selected_entity (chunk_id, source_kind, source_id, snippet, span_start, span_end, confidence), paginated. Present only when kg_inspector_tab is mentions.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 420,
    group: "kg_inspector",
  },
  {
    name: "kg_edges_filter",
    label: "KG edges filter",
    description:
      "Edges tab filter/sort state: { orgId, edgeKind, sortKey, sortDir }. Present only when kg_inspector_tab is edges.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 425,
    group: "kg_inspector",
  },
  {
    name: "kg_edges",
    label: "KG top edges",
    description:
      "Graph edges matching kg_edges_filter (id, kind, src_name, src_kind, dst_name, dst_kind, weight), up to 200. Present only when kg_inspector_tab is edges.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 430,
    group: "kg_inspector",
  },

  // ── Podcasts admin ───────────────────────────────────────────────────
  {
    name: "podcast_shows",
    label: "Podcast shows",
    description:
      "Every show (id, slug, title, author, is_published, created_at) loaded on the Shows list. Present only on podcasts_shows.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 500,
    group: "podcasts",
  },
  {
    name: "podcast_shows_search",
    label: "Podcast shows search",
    description:
      "The Shows list's search text (URL-persisted, filters title/slug/author/id client-side). Empty when unset. Present only on podcasts_shows.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 505,
    group: "podcasts",
  },
  {
    name: "podcast_current_show_id",
    label: "Active show ID",
    description:
      'UUID of the show open on a show-detail page, or "new" on the create form. Present only on podcasts_show_detail.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 510,
    group: "podcasts",
  },
  {
    name: "podcast_current_show",
    label: "Active show",
    description:
      "Full show record: { id, slug, title, description, image_url, author, is_published, rss_settings }. Absent when podcast_current_show_id is \"new\" and nothing has been saved yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 515,
    group: "podcasts",
  },
  {
    name: "podcast_current_show_episodes",
    label: "Active show's episodes",
    description:
      "Episodes belonging to podcast_current_show_id (id, slug, title, episode_number, duration_seconds, is_published), newest data first. Present only on podcasts_show_detail; empty array before the first episode.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    sortOrder: 520,
    group: "podcasts",
  },
  {
    name: "podcast_active_panel",
    label: "Podcast detail panel",
    description:
      '"show" (settings form) or "episodes" (episode list), URL-persisted sub-tab of the show detail page. Present only on podcasts_show_detail.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 525,
    group: "podcasts",
  },
  {
    name: "podcast_current_episode_id",
    label: "Active episode ID",
    description:
      'UUID of the episode open on the episode-detail page, or "new" on the create form. Present only on podcasts_episode_detail.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 530,
    group: "podcasts",
  },
  {
    name: "podcast_current_episode",
    label: "Active episode",
    description:
      "Full episode record: { id, show_id, title, description, audio_url, video_url, display_mode, episode_number, duration_seconds, speakers, script, chapters, is_published }. Absent when podcast_current_episode_id is \"new\" and nothing has been saved yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 535,
    group: "podcasts",
  },

  // ── Research system admin ───────────────────────────────────────────
  {
    name: "research_admin_tab",
    label: "Research admin tab",
    description:
      'Which of the three tabs is active: "templates", "agents" (the agent-wiring dashboard), or "projects". Present only on research_system.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 600,
    group: "research_system",
  },
  {
    name: "research_templates",
    label: "Research templates",
    description:
      "Research templates (id, name, description, is_system, keyword_templates, default_tags, agent_config — the seven agent-role keys like page_summary_agent_id, research_report_agent_id — autonomy_level). Present only on research_system.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 610,
    group: "research_system",
  },
  {
    name: "research_builtin_agents",
    label: "Research builtin agents",
    description:
      "Builtin agent id/name pairs used to resolve each agent_config slot to a readable name in the templates and agent-wiring views.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    autoContext: false,
    sortOrder: 615,
    group: "research_system",
  },
  {
    name: "research_topics",
    label: "Research topics/projects",
    description:
      "Research topic rows on the Projects tab (id, name, status, template_id, autonomy_level, linked project id via association edge), up to 50. Present only on research_system.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 620,
    group: "research_system",
  },
];

export const adminKnowledgeManifest: SurfaceManifest = {
  surfaceName: ADMIN_KNOWLEDGE_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — vocabulary audited against the live pages, no runtime emitter wired yet. /administration/knowledge itself is a static link directory (no data, no values). growth-loop is deliberately excluded (its own pillar/doctrine). Wiring an emitter per child is real follow-up work: cms-agents has 5 concurrently-mounted panels, kg-cost/kg-inspector/podcasts/research-system each have their own filter+pagination+selection state.",
  label: "Knowledge Admin",
  urlPattern: "/administration/knowledge",
  intro: `<surface_intro>
This is an ADMIN surface: the Knowledge admin family at /administration/knowledge, covering five unrelated super-admin tools that happen to live under one hub.

knowledge_section tells you which one is active: "cms_agents" (fleet-wide CMS agent/human activity feed, per-site page tree, agent write policy, validation-exception approvals), "kg_cost" (auto-ingest spend KPIs, per-org leaderboard, in-flight provider batches), "kg_inspector" (read-only knowledge-graph entity/mention/edge browser), "podcasts_shows"/"podcasts_show_detail"/"podcasts_episode_detail" (podcast show and episode CRUD), or "research_system" (research templates, per-role agent wiring, topic/project overview).

Only the values matching the current knowledge_section are populated — everything else is absent, not stale. Treat all rows here as live production data: summarize, diagnose, explain, but never republish verbatim at scale. This surface has no write targets yet — real mutation UI exists on several children (CMS policy editor, KG-cost auto-ingest toggles, podcast forms, research-template editors) but nothing is wired for agent writes.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminKnowledgeScope(values: {
  // alwaysAvailable: true → required
  knowledge_section:
    | "cms_agents"
    | "kg_cost"
    | "kg_inspector"
    | "podcasts_shows"
    | "podcasts_show_detail"
    | "podcasts_episode_detail"
    | "research_system";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  cms_sites?: unknown[];
  cms_activity_filter?: Record<string, unknown>;
  cms_activity_log?: unknown[];
  cms_selected_site_id?: string;
  cms_site_pages?: unknown[];
  cms_pending_exceptions?: unknown[];
  cms_selected_site_assets?: unknown[];
  kg_cost_summary?: Record<string, unknown>;
  kg_cost_org_rows?: unknown[];
  kg_cost_batch_rows?: unknown[];
  kg_cost_open_org_id?: string;
  kg_cost_org_detail?: Record<string, unknown>;
  kg_cost_open_batch_id?: string;
  kg_cost_batch_detail?: Record<string, unknown>;
  kg_inspector_tab?: "entities" | "mentions" | "edges";
  kg_inspector_selected_entity?: Record<string, unknown>;
  kg_entities_filter?: Record<string, unknown>;
  kg_entities?: unknown[];
  kg_mentions?: unknown[];
  kg_edges_filter?: Record<string, unknown>;
  kg_edges?: unknown[];
  podcast_shows?: unknown[];
  podcast_shows_search?: string;
  podcast_current_show_id?: string;
  podcast_current_show?: Record<string, unknown>;
  podcast_current_show_episodes?: unknown[];
  podcast_active_panel?: "show" | "episodes";
  podcast_current_episode_id?: string;
  podcast_current_episode?: Record<string, unknown>;
  research_admin_tab?: "templates" | "agents" | "projects";
  research_templates?: unknown[];
  research_builtin_agents?: unknown[];
  research_topics?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
