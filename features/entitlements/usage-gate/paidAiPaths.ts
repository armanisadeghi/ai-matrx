// features/entitlements/usage-gate/paidAiPaths.ts
//
// THE CENSUS of client calls that start paid AI work on the server — every
// endpoint whose POST spends AI points (an agent turn, a mandate or workflow
// run, a test or bench run, speech, transcription, image or podcast
// generation, and the feature endpoints that run an agent for their answer).
// `callApi` runs the usage gate's near/over pre-check (USAGE-GATE.md rules
// 10-12) and the refusal handling for exactly these.
//
// Templates are the generated API schema's path keys, so a renamed or removed
// endpoint fails `paid-ai-paths-are-real.test.ts`. A resume, rejoin,
// tool-result post or cancel is never listed: it continues a running request,
// which is never stopped (rule 5).

const PAID_AI_POST_PATHS: ReadonlySet<string> = new Set([
  // Agent turns and chat
  "/ai/agents/{agent_id}",
  "/ai/agent/{agent_id}",
  "/ai/agents-blocks/{agent_id}",
  "/ai/conversations/{conversation_id}",
  "/ai/conversation/{conversation_id}",
  "/ai/conversations/{conversation_id}/fork-and-run",
  "/ai/conversation/{conversation_id}/fork-and-run",
  "/ai/manual",
  "/ai/chat",
  "/ai/chat/direct-chat",
  "/ai/chat/prompt-execution",
  "/ai/prompts/{prompt_id}",
  "/ai/mandates/{mandate_key}",
  "/ai/context/preview/answer-both",
  "/ai/google/embeddings",
  // Mandates, agent tests and agent runs
  "/mandates/{mandate_key}/try",
  "/mandates/{mandate_key}/test",
  "/mandates/{mandate_key}/tests",
  "/agent-testing/agents/{agent_id}/tests",
  "/agent-battles/{set_id}/run",
  "/agent-iteration/run-initial",
  "/agent-iteration/feedback",
  "/workflows/{definition_id}/runs",
  "/workflows/{definition_id}/nodes/{node_id}/test",
  "/workflows/{definition_id}/step-runs",
  "/workflow-builder/workflows/{workflow_id}/test",
  "/workflows/comparisons/{comparison_id}/arms/{arm_index}/rerun",
  "/runs/{run_id}/nodes/{node_id}/execute",
  "/runs/{run_id}/nodes/{node_id}/retry",
  "/runs/{run_id}/nodes/{node_id}/rerun-from",
  "/runs/{run_id}/nodes/{node_id}/fork-from",
  "/hindsight/regression-cases/{case_id}/run",
  "/masterworks/{rulebook_id}/bench/runs",
  // Audio, image, podcast and document generation
  "/audio/text-to-speech",
  "/audio/transcribe",
  "/audio/transcribe-url",
  "/audio/transcribe-file",
  "/audio/voice-preview",
  "/images/generate",
  "/images/edit",
  "/images/inpaint",
  "/education/images/generate-card",
  "/podcast/generate",
  "/podcast/runs/{run_id}/assets/regenerate",
  "/podcast/runs/{run_id}/assets/add",
  "/podcast/races",
  "/podcast/races/{race_id}/arms/{arm}/rerun",
  "/office/generate",
  "/utilities/pdf/process-with-ai",
  // Feature work that runs agents
  "/v1/meet/intelligence/ask",
  "/v1/meet/chat",
  "/v1/meet/meetings/{meeting_id}/brief",
  "/v1/meet/agenda-draft",
  "/brand-voice/extract",
  "/brand-voice/fix",
  "/news/setup/propose",
  "/outreach/single/drafts",
  "/outreach/personalization/lists/{outreach_list_id}/run",
  "/outreach/replies/lists/{outreach_list_id}/run",
  "/research/suggest",
  "/research/topics/{topic_id}/sources/{source_id}/analyze",
  "/research/topics/{topic_id}/analyze-all",
  "/research/topics/{topic_id}/synthesize",
  "/research/topics/{topic_id}/run",
  "/research/topics/{topic_id}/document",
  "/research/topics/{topic_id}/generate-tag-suggestions",
  "/research/topics/{topic_id}/auto-tag",
  "/research/topics/{topic_id}/auto-consolidate",
  "/research/topics/{topic_id}/score-sources",
  "/research/topics/{topic_id}/intent",
  "/research/youtube/videos/{video_id}/process",
  "/seo/brands/{brand_id}/strategy/generate",
  "/seo/sites/{site_id}/strategy/generate",
  "/seo/sites/{site_id}/competitors/classify",
  "/seo/sites/{site_id}/ai-visibility/analyze",
  "/seo/sites/{site_id}/competitor-autopsy",
  "/seo/sites/{site_id}/reputation/analyze",
  "/seo/sites/{site_id}/press/angles/generate",
  "/seo/keywords/{keyword_id}/serp-intent-analysis",
  "/seo/keywords/classify",
  "/seo/pages/analyze",
  "/seo/pages/analyze-batch",
  "/seo/findings/draft-fix",
  "/seo/sites/strategy-interview",
  "/seo/sites/{site_id}/intake/run",
  "/seo/press/source-requests/{request_id}/evaluate",
  "/content-plan/sites/{site_id}/generate",
  "/content-plan/nodes/{node_id}/deepen",
  "/content-plan/nodes/{node_id}/draft-brief",
  "/content-plan/nodes/{node_id}/draft",
  "/content-plan/sites/{site_id}/cms-fill",
  "/ai-visibility/panels/{panel_id}/run",
  "/pr-calendar/brands/{brand_id}/run",
  "/coverage/trackers/{tracker_id}/run",
  "/crm/outreach-lists/{list_id}/media-research/run",
  "/vision-interview/sessions/{session_id}/observe",
  "/vision-interview/sessions/{session_id}/finish",
]);

/** Every listed template (tests and the census report read it). */
export function paidAiPostPaths(): readonly string[] {
  return [...PAID_AI_POST_PATHS];
}

/**
 * Does this callApi call start paid AI work? `path` is the schema template
 * (`config.path`); a `/v2` prefix is the same endpoint.
 */
export function isPaidAiCall(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const base = path.startsWith("/v2/") ? path.slice(3) : path;
  return PAID_AI_POST_PATHS.has(base);
}
