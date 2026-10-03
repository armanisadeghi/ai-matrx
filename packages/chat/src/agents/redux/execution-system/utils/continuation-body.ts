/**
 * buildContinuationBody — the body of a turn-2+ `POST /ai/conversations/{id}`.
 *
 * Turn 1 sends the whole assembled payload; a continuation sends a deliberate
 * subset. That subset used to be an inline whitelist in `execute-instance`, and
 * every field it forgot was dropped with nothing on screen to say so: a skill
 * added mid-conversation through Chat Options never left the browser on turn
 * 2+ (`skill_config`, live 2026-10-01 conversation c027c75d…), nor did a
 * type-only scope selection (`active_scope_type_ids`).
 *
 * Every key of the server's `ConversationContinueRequest` is classified in
 * `CONTINUATION_FIELD_ROUTING` — forwarded, or not forwarded with the reason —
 * and the type makes a new server field fail type-check until it is classified.
 * Guard: `__tests__/continuation-body.test.ts`.
 */

import type { ConversationContinueRequest } from "../../../types/agent-api-types";
import type { AssembledAgentStartRequest } from "../../../types/request.types";

type ContinueKey = keyof ConversationContinueRequest;

/** `true` = forwarded from the assembled payload when set; a string = why not. */
export const CONTINUATION_FIELD_ROUTING = {
  // Conversation identity — re-sent every turn (request wins; server also
  // restores from the conversation row when omitted).
  organization_id: true,
  project_id: true,
  task_id: true,
  source_app: true,
  source_feature: true,
  initiation: true,
  // Latest active scope selections — a mid-conversation switch applies now.
  scope_ids: true,
  active_scope_type_ids: true,
  target_instance_id: true,
  config_overrides: true,
  tools: true,
  tools_replace: true,
  client: true,
  user: true,
  sandbox: true,
  context: true,
  context_withheld: true,
  // The page rule (RULES.md §0): every turn of the page's own conversation, or
  // of one whose page switch is off, withholds the page — not only the first.
  page_context: true,
  // Where each mounted screen's value sits (a transcript open on the Knowledge
  // page) — every turn, from the same door call as `context`.
  context_surfaces: true,
  block_mode: true,
  snapshot: true,
  memory: true,
  memory_model: true,
  // The chosen class of `memory_model` — rides only with it.
  memory_offering_id: true,
  memory_scope: true,
  // Per-conversation skill picks (Chat Options → Skills).
  skill_config: true,
  // Set by the builder itself, not copied from the payload.
  user_input: "set by the builder (omitted on retry)",
  retry: "set by the builder from the retry flag",
  stream: "always true on this path",
  debug: "set by the builder from the debug flag",
  cache_bypass: "set by the builder from the consumed cache-bypass flags",
  store: "this path is persisted-only by construction",
  context_anchor: "anchors a conversation at start; continue does not read it",
  ide_state: "not assembled by this thunk",
  writable_variables: "not assembled by this thunk",
  allow_context_create: "not assembled by this thunk",
  max_iterations: "not assembled by this thunk",
  max_retries_per_iteration: "not assembled by this thunk",
  responder_agent_id: "coding-mirror replies only; not assembled by this thunk",
} as const satisfies Record<ContinueKey, true | string>;

const FALSE_IS_MEANINGFUL = new Set(["memory", "tools_replace", "context_withheld"]);

export interface ContinuationBodyOptions {
  retry: boolean;
  debug: boolean;
  cacheBypass: unknown;
}

export function buildContinuationBody(
  payload: AssembledAgentStartRequest,
  { retry, debug, cacheBypass }: ContinuationBodyOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = retry
    ? { retry: true }
    : { user_input: payload.user_input };
  body.stream = true;

  const source = payload as Record<string, unknown>;
  for (const [key, route] of Object.entries(CONTINUATION_FIELD_ROUTING)) {
    if (route !== true) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    // Preserve the old whitelist's emptiness rules: an empty list or `false`
    // flag is "not set", except the fields whose false/empty is meaningful.
    if (Array.isArray(value) && value.length === 0 && key !== "tools") continue;
    if (value === false && !FALSE_IS_MEANINGFUL.has(key)) continue;
    if (value === "") continue;
    body[key] = value;
  }
  if (debug) body.debug = true;
  if (cacheBypass) body.cache_bypass = cacheBypass;
  return body;
}
