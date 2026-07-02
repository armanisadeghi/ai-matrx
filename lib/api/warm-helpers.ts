/**
 * Warm-helper utilities — centralized fire-and-forget pre-warm POSTs to the
 * backend so the next real request finds the resource already cached.
 *
 * Every warm call across the app should go through these helpers. Hand-rolled
 * `fetch(${BACKEND_URLS.production}${ENDPOINTS.ai.agentWarm(id)})` was the old
 * pattern and is being phased out: it ignores the in-header server picker,
 * silently swallows errors, and duplicates the URL-resolution logic at every
 * callsite.
 *
 * Server vs client:
 *   - Server callers (page.tsx server components) cannot read the picker —
 *     they pass an explicit `baseUrl` (typically `BACKEND_URLS.production`).
 *   - Client callers should use `useWarmAgent` / `useWarmConversation`,
 *     which resolve the base URL from `selectResolvedBaseUrl` and fire on
 *     idle so they don't compete with the page's render path.
 *
 * Errors are intentionally swallowed — warm is best-effort. Telemetry can be
 * added by listening on the optional `onError` callback.
 */

import { ENDPOINTS } from "@/lib/api/endpoints";

interface WarmOptions {
  /**
   * Resolved backend URL. Server callers typically pass `BACKEND_URLS.production`,
   * which is `string | undefined` when the env var isn't configured — accepted
   * here (not coerced to `""` at the call site) because the warm functions
   * below already no-op on a falsy `baseUrl`.
   */
  baseUrl: string | undefined;
  /** Optional callback for telemetry; warm failures never throw. */
  onError?: (err: unknown) => void;
}

interface WarmAgentOptions extends WarmOptions {
  /** True when the path id is an agx_version id, not an agx_agent id. */
  isVersion?: boolean;
}

/**
 * POST /ai/agents/{agentId}/warm — preloads the agent's execution payload.
 * Body is `{ "is_version": true }` when `isVersion` is true; otherwise omitted.
 * Public route, no auth.
 */
export function warmAgent(
  agentId: string,
  { baseUrl, isVersion, onError }: WarmAgentOptions,
): void {
  if (!baseUrl || !agentId) return;
  const url = `${baseUrl}${ENDPOINTS.ai.agentWarm(agentId)}`;
  const body = isVersion ? JSON.stringify({ is_version: true }) : undefined;
  fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body,
    keepalive: true,
  }).catch((err) => {
    onError?.(err);
  });
}

/**
 * POST /ai/conversations/{conversationId}/warm — preloads the conversation
 * cache. No body. Public route, no auth.
 */
export function warmConversation(
  conversationId: string,
  { baseUrl, onError }: WarmOptions,
): void {
  if (!baseUrl || !conversationId) return;
  const url = `${baseUrl}${ENDPOINTS.ai.conversationWarm(conversationId)}`;
  fetch(url, { method: "POST", keepalive: true }).catch((err) => {
    onError?.(err);
  });
}
