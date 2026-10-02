// lib/api/ai-api-version.ts
//
// Single source of truth for which version of the AI runtime THIS APP talks
// to. The transform machinery itself (toV2Path, the covered-surface
// allowlist, isV2Path, toV1FallbackUrl, applyAiApiVersion) MOVED into the
// published package (`@ai-matrx/agents/matrx`, 0.6.0 — the C22 retrofit) and
// is re-exported here so existing import sites keep their path. Change the
// transform only in the package, with the server.
//
// What stays host-owned:
//   - AI_API_VERSION_DEFAULT — THE app-wide flag (deliberately a code-level
//     constant, not an env var, so the value is grep-able and a full revert
//     is a one-line diff; the admin sidebar toggle overrides it per-browser).

import type { MatrxAiApiVersion } from "@ai-matrx/agents/matrx";

export {
  applyAiApiVersion,
  isCoveredAiPath,
  isV2Path,
  toV1FallbackUrl,
  toV2Path,
  V2_COVERED_AI_PATH_TEMPLATES,
} from "@ai-matrx/agents/matrx";

export type AiApiVersion = MatrxAiApiVersion;

/**
 * THE flag. This single code-level constant is the app-wide default AI API
 * version.
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
 * The exact-match `pathOverrides` map to hand `resolveEndpointPath` — keyed on
 * the canonical templates, valued at their `/v2` siblings. Empty for v1. Moved
 * into `@ai-matrx/agents/matrx` (P9); re-exported here.
 */
export { aiVersionPathOverrides } from "@ai-matrx/agents/matrx";
