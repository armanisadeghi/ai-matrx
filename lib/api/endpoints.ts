// lib/api/endpoints.ts
// Single source of truth for all Python FastAPI backend endpoint paths.
// Import ENDPOINTS from this file — never hardcode paths.

// Every endpoint path MOVED into `@ai-matrx/agents/matrx` (chat-package
// independence P9): one list for every client. Re-exported so import sites keep
// their path; add a path in the package. The base URLs below are this app's
// environment values and stay here.
export { ENDPOINTS } from "@ai-matrx/agents/matrx";

// NOTE: The AI runtime v1/v2 spine version now lives in
// `lib/api/ai-api-version.ts` (the single `AI_API_VERSION_DEFAULT` flag +
// covered-surface helpers). The old `SPINE_V2_PATH_OVERRIDES` map that lived
// here used the WRONG `/ai/v2/*` nesting; the backend routes are `/v2/ai/*`.
// It has been removed — do not reintroduce a per-path v2 map here.

/**
 * THE ONE NAME for the aidream production origin.
 *
 * 🚨 Never add a second variable name for this value, and never read it through
 * a `??` / `||` chain over another name. `NEXT_PUBLIC_BACKEND_URL` was exactly
 * that second name until 2026-08-27: seventeen call sites read it, `.env.example`
 * called it "the active one" — and every resolver that actually decides the wire
 * target (`resolveBaseUrl`, `BACKEND_URLS.production`, `configuredServiceUrl`)
 * read `NEXT_PUBLIC_BACKEND_URL_PROD` instead, so setting it moved nothing and a
 * verifier lost most of a round to it. Law:
 * ../common-docs/policies/env-vars-are-values-not-toggles.md § "One value, ONE
 * variable name".
 *
 * The hardcoded production default is deliberate (same policy): a missing
 * variable must never silently degrade the origin. Pointing the app at another
 * server is NOT this constant's job — that is the admin server toggle
 * (`switchServer` in `apiConfigSlice`, surfaced by `SidebarEnvToggle`), which
 * every store-aware resolver honors.
 */
export const AIDREAM_PRODUCTION_URL: string =
  process.env.NEXT_PUBLIC_BACKEND_URL_PROD ??
  "https://server.app.matrxserver.com";

/**
 * Backend base URLs — one entry per ServerEnvironment in adminPreferencesSlice.
 *
 * Every value comes from an environment variable. Only `production` and
 * `localhost` — the two origins the app must always be able to reach — carry a
 * hardcoded default; a missing variable for any other tier stays `undefined`,
 * which surfaces as a clear error rather than silently pointing at the wrong
 * server. Configure every env in .env.local / Vercel project settings.
 *
 * Environment variables:
 *   NEXT_PUBLIC_BACKEND_URL_PROD     → production server (default above)
 *   NEXT_PUBLIC_BACKEND_URL_DEV      → development/feature-branch server
 *   NEXT_PUBLIC_BACKEND_URL_STAGING  → staging server
 *   NEXT_PUBLIC_BACKEND_URL_LOCAL    → local dev (default: http://localhost:8000)
 *   NEXT_PUBLIC_BACKEND_URL_GPU      → dedicated GPU inference server
 *
 * Use the service origin only (e.g. https://server.example.com), not a path
 * suffix like https://server.example.com/api — paths in ENDPOINTS are rooted at
 * the host (/health, /ai, …). A bad base produces wrong URLs and server warnings.
 *
 * 'custom' is not listed here — it is stored in adminPreferences.customServerUrl
 * and resolved dynamically in resolveBaseUrl().
 */
export const BACKEND_URLS: Record<string, string | undefined> = {
  production: AIDREAM_PRODUCTION_URL,
  development: process.env.NEXT_PUBLIC_BACKEND_URL_DEV,
  staging: process.env.NEXT_PUBLIC_BACKEND_URL_STAGING,
  localhost:
    process.env.NEXT_PUBLIC_BACKEND_URL_LOCAL ?? "http://localhost:8000",
  gpu: process.env.NEXT_PUBLIC_BACKEND_URL_GPU,
} as const;
