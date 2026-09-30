// features/admin/usage-drill/usageWords.ts — THE WORDS FOR EVERY CODE AI USAGE GROUPS BY
// (VERIFIER-32 F5, 2026-09-30: keys never reach a person).
//
// The usage definition's code-valued Dimensions (app, feature, origin, source, provider, model,
// manual/automated) carry what the ledger stores: `child_agent`, `sch_run`,
// `agent_service:5d0b07f8-…`, a null provider beside `unknown`. Each value reads here as plain
// words; an unknown code is turned into words by the one humanizer, and an id is never printed.
// Census of the live values (2026-09-30, `runtime._ai_usage_hourly`) in PROGRESS-DRILL-USAGE-PAGE.

import { originClassLabel } from "@/lib/usage/originClass";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Any code as words: separators become spaces, ids drop out, the first letter is capitalised. */
export function plainWords(code: string): string {
  const words = code
    .replace(UUID, " ")
    .replace(/[._:/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Unnamed";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const APPS: Record<string, string> = {
  aidream: "AI Dream server",
  "matrx-frontend": "AI Matrx web app",
  "mcp-agent-service": "MCP agent service",
  "matrx-scheduler": "Scheduler",
  workflow: "Workflows",
  "matrx-extend": "Browser extension",
  "workflow-studio": "Workflow Studio",
  "matrx-local": "Matrx Local",
  "matrx-desktop": "Matrx Desktop",
  "code-plugin": "Claude Code plugin",
  "matrx-ai": "Matrx AI package",
};

const SOURCES: Record<string, string> = {
  conversation: "Conversation",
  internal_agent_run: "Agent started by another agent",
  sch_run: "Scheduled run",
  workflow: "Workflow",
  external_api: "External API call",
  audio_transcription: "Audio transcription",
  assist_producer: "Assist",
  processed_document: "Document processing",
  cld_file: "Cloud file",
  "runtime.work_item": "Background work item",
  agent_run: "Agent run",
  web_crawl_session: "Web crawl",
  batch_work_item: "Batch item",
  rag_search: "Knowledge search",
  pex_job: "Processing job",
  cx_tool_call: "Tool call",
  cx_conversation: "Conversation",
};

const PROVIDERS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  groq: "Groq",
  cerebras: "Cerebras",
  moonshot: "Moonshot",
  replicate: "Replicate",
  together: "Together AI",
  elevenlabs: "ElevenLabs",
  typesafe: "Typesafe",
  fastino_extraction: "Fastino",
  local: "A local model",
};

/** A feature code: `agent_service:<id>` → "Agent service" (the agent is its own Dimension), `mandate:seo.topic_assigner` → "Mandate · Seo topic assigner". */
export function featureWords(code: string): string {
  if (!code) return "No feature recorded";
  const [head, ...rest] = code.split(":");
  const tail = rest.join(":").replace(UUID, "").trim();
  if (!tail) return plainWords(head ?? code);
  return `${plainWords(head ?? "")} · ${plainWords(tail)}`;
}

/** Plain words per code-valued Dimension of the `ai_usage` definition. */
/** Words for an id the names door did not name (it answers every id once its v2 is applied). */
export const UNNAMED: Record<"person" | "organization" | "agent", string> = {
  person: "A person whose name could not be read",
  organization: "An organization whose name could not be read",
  agent: "An agent whose name could not be read",
};

export const USAGE_WORDS: Record<string, (value: string) => string> = {
  app: (v) => (v ? APPS[v] ?? plainWords(v) : "No app recorded"),
  feature: featureWords,
  origin: (v) => (v ? (originClassLabel(v) === v ? plainWords(v) : originClassLabel(v)) : originClassLabel(null)),
  trigger: (v) => (v === "manual" ? "Manual" : v === "automated" ? "Automated" : v ? plainWords(v) : "Not recorded"),
  source: (v) => (v ? SOURCES[v] ?? plainWords(v) : "No source recorded"),
  provider: (v) => (!v ? "No model (tools and services)" : v === "unknown" ? "Provider not recorded" : PROVIDERS[v] ?? plainWords(v)),
  model: (v) =>
    !v ? "No model (tools and services)" : v === "unknown" ? "Model not recorded" : /^[0-9a-f-]{36}$/i.test(v) ? "A model no longer in the catalog" : v,
};
