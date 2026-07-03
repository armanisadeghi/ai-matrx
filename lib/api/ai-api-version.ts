// lib/api/ai-api-version.ts
//
// Single source of truth for which version of the AI runtime the app talks to.
//
// Background: the Python backend now exposes a `/v2` runtime-spine namespace
// that wraps the four core AI request surfaces in a request-tracking envelope.
// The request body, headers, and streaming response are BYTE-IDENTICAL to v1 —
// the only difference is the URL. See:
//   aidream/docs/runtime/V2_FRONTEND_MIGRATION.md
//
// ─── The one rule that keeps burning us ─────────────────────────────────────
// `/v2` is inserted at the FRONT of the in-app path, right before `/ai`:
//
//     /ai/chat                → /v2/ai/chat            ✅ correct
//     /ai/agents/{id}         → /v2/ai/agents/{id}     ✅ correct
//     /ai/conversations/{id}  → /v2/ai/conversations/{id}
//
//     /ai/v2/chat                                       ❌ WRONG (nested) — 404s
//
// The earlier attempt nested it under `/ai/v2/*`; the backend routes are
// `/v2/ai/*`. `toV2Path` below is the ONLY place this transform is spelled out,
// so it can never drift again.
//
// ─── Scope: ONLY four surfaces have a v2 form ───────────────────────────────
// v2 covers `chat`, `manual`, `agents/{id}`, `conversations/{id}` (+ the
// singular `agent`/`conversation` aliases). EVERYTHING ELSE — cancel, warm,
// resume, fork-and-run, invalidate-cache, prompts, agents-blocks, ai-models,
// health, files … — has NO v2 route. The server does NOT auto-downgrade: a
// `/v2` request to an uncovered surface is a plain 404. So we must prefix
// ONLY the covered surfaces and leave every other path untouched. That is why
// this is a scoped allowlist, never a blanket "prefix every path" switch.

import { ENDPOINTS } from "./endpoints";

export type AiApiVersion = "v1" | "v2";

/**
 * THE flag. This single code-level constant is the app-wide default AI API
 * version — deliberately NOT an env var, so the value is visible and grep-able
 * in the source and a full revert is a one-line diff.
 *
 * - `"v2"` (current): the whole app talks to the v2 runtime spine by default.
 * - `"v1"`: instant, total, app-wide revert to the legacy runtime.
 *
 * The admin sidebar toggle (SidebarApiVersionToggle) overrides this per-browser
 * at runtime (persisted, like the localhost/production server toggle) without
 * touching this constant. When no admin override is set, this value wins.
 */
export const AI_API_VERSION_DEFAULT: AiApiVersion = "v2";

/**
 * The canonical v1 path TEMPLATES the v2 spine covers — spelled exactly as the
 * execute thunks / `resolveEndpointPath` registry pass them (with `{param}`
 * placeholders intact). These feed `aiVersionPathOverrides` below.
 *
 * `ENDPOINTS.ai.manual` === `"/ai/manual"`. `"/ai/chat"` is listed separately
 * because the backend keeps `/v2/ai/chat` and `/v2/ai/manual` as distinct
 * routes and some direct callers (the api-test demos) still POST `/ai/chat`.
 */
export const V2_COVERED_AI_PATH_TEMPLATES = [
  ENDPOINTS.ai.manual, // "/ai/manual"
  "/ai/chat",
  "/ai/agents/{agent_id}",
  "/ai/agent/{agent_id}", // singular alias — behaves identically
  "/ai/conversations/{conversation_id}",
  "/ai/conversation/{conversation_id}", // singular alias
] as const;

/**
 * Insert `/v2` at the front of an in-app path. Idempotent, and prefix-aware:
 * a legacy `/api/` compatibility prefix (stripped server-side) is preserved so
 * `/api/ai/chat` → `/api/v2/ai/chat`, matching the migration doc's rule to keep
 * whatever prefix the caller already uses and only change the version segment.
 */
export function toV2Path(path: string): string {
  const withLead = path.startsWith("/") ? path : `/${path}`;
  // Preserve a leading /api compat prefix (server strips it either way).
  if (withLead.startsWith("/api/")) {
    const rest = withLead.slice("/api".length); // "/ai/chat"
    return rest.startsWith("/v2/") ? withLead : `/api/v2${rest}`;
  }
  return withLead.startsWith("/v2/") ? withLead : `/v2${withLead}`;
}

/**
 * The exact-match `pathOverrides` map to hand `resolveEndpointPath` — keyed on
 * the canonical templates, valued at their `/v2` siblings. Empty for v1.
 *
 * This is how every call that flows through the endpoint-override registry
 * (callApi, execute-instance, execute-manual, prompt-preview) picks up v2 for
 * the covered surfaces — and ONLY the covered surfaces — automatically.
 */
export function aiVersionPathOverrides(
  version: AiApiVersion,
): Record<string, string> {
  if (version !== "v2") return {};
  const map: Record<string, string> = {};
  for (const template of V2_COVERED_AI_PATH_TEMPLATES) {
    map[template] = toV2Path(template);
  }
  return map;
}

// Interpolated (concrete) forms of the covered surfaces — used to guard the
// direct-fetch callers that build a real path (id already substituted) outside
// the resolveEndpointPath registry. Anchored so ONLY the four exact shapes
// match: sub-paths like `/ai/agents/{id}/warm`, `/ai/conversations/{id}/resume`,
// `/ai/agents-blocks/{id}`, and `/ai/cancel/{id}` deliberately do NOT match and
// stay on v1. The optional `/api` prefix mirrors `toV2Path`.
const COVERED_INTERPOLATED_PATH = [
  /^(?:\/api)?\/ai\/manual$/,
  /^(?:\/api)?\/ai\/chat$/,
  /^(?:\/api)?\/ai\/agents\/[^/]+$/,
  /^(?:\/api)?\/ai\/agent\/[^/]+$/,
  /^(?:\/api)?\/ai\/conversations\/[^/]+$/,
  /^(?:\/api)?\/ai\/conversation\/[^/]+$/,
];

/** Whether `path` (already interpolated) is one of the four covered surfaces. */
export function isCoveredAiPath(path: string): boolean {
  return COVERED_INTERPOLATED_PATH.some((re) => re.test(path));
}

/**
 * Apply the active AI API version to an ALREADY-INTERPOLATED in-app path. This
 * is the bridge for direct-fetch callers that build a concrete path themselves
 * (useBackendApi, applet follow-up, public-chat, api-test demos) instead of
 * going through `resolveEndpointPath`.
 *
 * - Covered surface + v2  → `/v2` prefix inserted.
 * - Anything else (or v1) → returned unchanged.
 *
 * Pass the in-app PATH only (no scheme/host); prepend the base URL afterward.
 */
export function applyAiApiVersion(
  path: string,
  version: AiApiVersion,
): string {
  if (version !== "v2") return path;
  return isCoveredAiPath(path) ? toV2Path(path) : path;
}
