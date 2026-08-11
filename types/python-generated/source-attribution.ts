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
  "aidream-file-rag-jobs",
  "aidream-hindsight",
  "aidream-notify-listener",
  "aidream-page-extraction",
  "aidream-scraper-scheduler",
  "aidream-suggestion-sweep",
  "aidream-sweep-listener",
  "aidream-workflow-extract-sweep",
  "chat",
  "claude-code",
  "codex",
  "cursor",
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
  "expertise",
  "files",
  "image-studio",
  "incident-assurance",
  "marketing",
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
  "system",
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
  "hindsight_replay",
  "kg_clustering_namer",
  "manual",
  "ner",
  "page_extraction",
  "pdf-cleaner",
  "prompt",
  "rag",
  "rag_chunk_contextualizer",
  "rag_hyde_generator",
  "rag_pdf_page_cleaner",
  "rag_query_expander",
  "schema_coerce",
  "server-run",
  "socket_compat",
  "summarize_content",
  "workflow_copilot",
  "workflow_node_test",
  "workflow_plan_assist",
  "workflow_recovery_advisor",
  "workflow_run",
  "workflow_worker",
  "youtube_transcription",
] as const;

export type SourceFeature = (typeof SOURCE_FEATURES)[number];

export const SOURCE_FEATURE_PATTERNS = [
  "rag_derive_[a-z0-9_]+",
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
