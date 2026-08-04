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
  "aidream-content-processing",
  "aidream-file-rag-jobs",
  "aidream-notify-listener",
  "aidream-page-extraction",
  "aidream-scraper-scheduler",
  "aidream-suggestion-sweep",
  "aidream-sweep-listener",
  "chat",
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
] as const;

export type SourceApp = (typeof SOURCE_APPS)[number];

export const SOURCE_FEATURES = [
  "agent-advanced-editor-window",
  "agent-app",
  "agent-assignment-demo",
  "agent-builder",
  "agent-comparison",
  "agent-content-window",
  "agent-creator-panel",
  "agent-generator",
  "agent-launcher-sidebar",
  "agent-run-history-window",
  "agent-run-window",
  "agent-runner",
  "agent-runs-sidebar",
  "agent-tester",
  "ai-results",
  "analysis-studio",
  "canvas",
  "chat",
  "cms",
  "code-editor",
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
  "marketing",
  "mermaid-workbench",
  "messages",
  "notes",
  "pdf-extractor",
  "pdf-widgets",
  "podcasts",
  "projects",
  "prompt-app",
  "rag-search",
  "research",
  "scanner",
  "scraper",
  "scratchpad",
  "tasks",
  "tool-call-visualization",
  "tool-testing",
  "transcription",
  "udt",
  "voice-agent",
  "working-document",
  "agent",
  "agent-factory",
  "agent-service",
  "agent_blocks",
  "agent_call",
  "agent_structure_builder",
  "agent_tool",
  "auto_ingest_ner",
  "builtin_agent",
  "clean_pdf_extracted_content",
  "content_processing_upload_hook",
  "context_summary",
  "conversation",
  "conversation_resume",
  "doc_verify",
  "fork_and_run",
  "kg_clustering_namer",
  "manual",
  "ner",
  "page_extraction",
  "pdf-cleaner",
  "podcast_audio_dialogue",
  "podcast_audio_english",
  "podcast_audio_persian",
  "podcast_content_extractor",
  "podcast_deep_research",
  "podcast_feature_image",
  "podcast_feature_image_prompt",
  "podcast_metadata",
  "podcast_multihost_script",
  "podcast_roundtable_script",
  "podcast_script_educational",
  "podcast_script_news",
  "podcast_script_persian",
  "podcast_solo_script",
  "prompt",
  "rag",
  "rag_chunk_contextualizer",
  "rag_hyde_generator",
  "rag_pdf_page_cleaner",
  "rag_query_expander",
  "research_condenser_1",
  "research_condenser_2",
  "schema_coerce",
  "server-run",
  "socket_compat",
  "summarize_content",
  "web-research",
  "workflow_node_test",
  "workflow_run",
  "workflow_worker",
  "youtube_transcription",
] as const;

export type SourceFeature = (typeof SOURCE_FEATURES)[number];

export const SOURCE_FEATURE_PATTERNS = [
  "rag_derive_[a-z0-9_]+",
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
