// AUTO-GENERATED — do not edit manually.
// Source: aidream.services.conversation_context.source_attribution
// Run: `uv run python scripts/generate_types.py source-attribution`
//   or fetch via `pnpm sync-types` (pulls /schema/bundle/source-attribution-ts).
//
// Conversation provenance allow-lists. matrx-frontend stamps
// source_app='matrx-frontend' and a product-level source_feature from
// SOURCE_FEATURES. Chrome/intermediaries are not features.

export const SOURCE_APPS = [
  "aidream",
  "aidream-api",
  "aidream-auto-ingest",
  "aidream-batch",
  "aidream-content-processing",
  "aidream-endpoint-family-sweep",
  "aidream-file-rag-jobs",
  "aidream-hindsight",
  "aidream-notify-listener",
  "aidream-outreach",
  "aidream-page-extraction",
  "aidream-producer-yield",
  "aidream-scraper-scheduler",
  "aidream-seo",
  "aidream-suggestion-sweep",
  "aidream-sweep-listener",
  "aidream-workflow-extract-sweep",
  "chat",
  "claude-code",
  "codex",
  "cursor",
  "dashboard",
  "matrx-admin",
  "matrx-ai",
  "matrx-desktop",
  "matrx-extend",
  "matrx-frontend",
  "matrx-local",
  "matrx-scheduler",
  "mcp-agent-service",
  "workflow",
  "workflow-studio",
  "vscode",
] as const;

export type SourceApp = (typeof SOURCE_APPS)[number];

export const SOURCE_FEATURES = [
  "agent-app",
  "agent-builder",
  "agent-comparison",
  "agent-generator",
  "agent-runner",
  "agents-other",
  "ai-results",
  "analysis-studio",
  "canvas",
  "chat",
  "cms",
  "code-editor",
  "crm",
  "content-extractor",
  "dictionary",
  "documents",
  "education-analytics",
  "education-assessment",
  "education-fastfire",
  "education-flashcards",
  "education-ingest",
  "education-mindmap",
  "education-planner",
  "education-tutor",
  "files",
  "image-studio",
  "incident-assurance",
  "marketing",
  "masterwork",
  "mermaid-workbench",
  "messages",
  "notes",
  "pdf-extractor",
  "pdf-widgets",
  "podcasts",
  "projects",
  "rag-search",
  "research",
  "scanner",
  "scraper",
  "scratchpad",
  "sms-assistant",
  "system",
  "tasks",
  "tool-call-visualization",
  "tool-testing",
  "transcription",
  "udt",
  "voice-agent",
  "working-document",
  "admin",
  "agent",
  "agent-factory",
  "agent-service",
  "agent_blocks",
  "agent_call",
  "agent_flow_v1",
  "agent_run",
  "agent_structure_builder",
  "agent_tool",
  "auto_ingest",
  "auto_ingest_ner",
  "background_agent",
  "browser_handoff_delegate",
  "browser_handoff_resolve",
  "builtin_agent",
  "builtin_categorize",
  "clean_pdf_extracted_content",
  "coding_session_native",
  "content_plan_acceptance",
  "content_plan_cms_fill",
  "content_plan_cms_fill_preview",
  "content_plan_deepen",
  "content_plan_generate",
  "content_processing",
  "content_processing_upload_hook",
  "context_summary",
  "conversation",
  "conversation_crash_recovery",
  "conversation_resume",
  "crawl_run",
  "deep_research_v1",
  "doc_verify",
  "education-media-reconcile",
  "education_card_image_generator",
  "education_card_image_prompt_writer",
  "education_card_image_qc_judge",
  "education_card_image_rot",
  "education_card_image_web_source",
  "education_card_images",
  "education_study_pack",
  "endpoint_family_sweep",
  "external_url_change",
  "fork_and_run",
  "hindsight",
  "hindsight/crystallization",
  "hindsight/wire_replay",
  "hindsight_replay",
  "hindsight_replay_worker",
  "hindsight_shadow_recompilation",
  "internal",
  "kg_clustering_namer",
  "manual",
  "ner",
  "page_extraction",
  "page_extraction_retry",
  "pdf-cleaner",
  "prompt",
  "rag",
  "rag_chunk_contextualizer",
  "rag_hyde_generator",
  "rag_pdf_page_cleaner",
  "rag_query_expander",
  "realtime",
  "realtime_tool",
  "research_condenser_1",
  "research_condenser_2",
  "research_refresh_dispatch",
  "scheduled",
  "schema_coerce",
  "server-run",
  "socket_compat",
  "summarize_content",
  "web_crawl_crash_resume",
  "web_crawl_schedule_dispatch",
  "web_research",
  "web_url_announce",
  "workflow_recovery_push",
  "workflow_run_assists",
  "workflow_decision_fallback",
  "workflow_node_test",
  "workflow_plan_assist",
  "workflow_recovery_advisor",
  "workflow_run",
  "workflow_worker",
  "vision_interview",
  "vision_interview_tracker",
  "youtube_transcription",
] as const;

export type SourceFeature = (typeof SOURCE_FEATURES)[number];

export const SOURCE_FEATURE_PATTERNS = [
  "rag_derive_[a-z0-9_]+",
  "mandate:[a-z0-9_]+\\.[a-z0-9_]+",
  "slot:[a-z0-9_]+\\.[a-z0-9_]+",
] as const;

const SOURCE_APP_SET: ReadonlySet<string> = new Set(SOURCE_APPS);
const SOURCE_FEATURE_SET: ReadonlySet<string> = new Set(SOURCE_FEATURES);
const SOURCE_FEATURE_REGEXES: readonly RegExp[] = SOURCE_FEATURE_PATTERNS.map(
  (pattern) => new RegExp(`^(?:${pattern})$`),
);

export function isSourceApp(value: string): value is SourceApp {
  return SOURCE_APP_SET.has(value);
}

export function isSourceFeature(value: string): value is SourceFeature {
  return (
    SOURCE_FEATURE_SET.has(value) ||
    SOURCE_FEATURE_REGEXES.some((pattern) => pattern.test(value))
  );
}

// origin_class — the WITNESSED trust axis of request attribution
// (source: matrx_connect.context.provenance.ORIGIN_CLASSES). Read-only
// vocabulary for filtering/faceting/display: clients NEVER stamp an
// origin_class — it is derived server-side from platform-observed facts.
export const ORIGIN_CLASSES = [
  "human",
  "client_auto",
  "api",
  "child_agent",
  "workflow",
  "scheduled",
  "system",
] as const;

// DB backfill value for pre-provenance history; never written live.
export const ORIGIN_CLASS_UNKNOWN = "unknown" as const;

export type OriginClass =
  | (typeof ORIGIN_CLASSES)[number]
  | typeof ORIGIN_CLASS_UNKNOWN;

const ORIGIN_CLASS_SET: ReadonlySet<string> = new Set([
  ...ORIGIN_CLASSES,
  ORIGIN_CLASS_UNKNOWN,
]);

export function isOriginClass(value: string): value is OriginClass {
  return ORIGIN_CLASS_SET.has(value);
}
