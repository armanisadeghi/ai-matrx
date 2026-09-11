/**
 * providerModelsRefresh — pull each provider's own models API into
 * `ai.provider.provider_models_cache`, server-side.
 *
 * The on-demand half of aidream's daily `provider_models_refresh` system
 * task (`POST /admin/ai-catalog/provider-models/refresh`, landed
 * 2026-09-11). Before this, the ONLY writer of the cache was this repo's
 * `app/api/ai-models/provider-sync` route — a second copy of five provider
 * contracts (Anthropic, OpenAI, Groq, Google — xAI was never even added).
 * That route is now deleted; `ProviderSyncDashboard`'s Sync Now calls this
 * thunk instead.
 *
 * Uses the canonical `callApi` thunk (auth, base-URL env selection, scope) —
 * never a raw fetch to the backend. Mirrors `catalogReload.ts`.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";

import { callApi } from "@/lib/api/call-api";
import type { RootState } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

export type ProviderModelsRefreshSummary =
  components["schemas"]["ProviderModelsRefreshSummary"];

const REFRESH_STATUSES = new Set([
  "refreshed",
  "missing_key",
  "no_provider_row",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isProviderModelsRefreshSummary(
  value: unknown,
): value is ProviderModelsRefreshSummary {
  if (!isRecord(value)) return false;
  const summary = value;
  if (typeof summary.started_at !== "string") return false;
  for (const key of ["refreshed", "missing_key", "no_provider_row", "failed"] as const) {
    if (typeof summary[key] !== "number") return false;
  }
  if (summary.results === undefined) return true;
  if (!Array.isArray(summary.results)) return false;
  return summary.results.every((result: unknown) => {
    if (!isRecord(result)) return false;
    const row = result;
    return (
      typeof row.provider_slug === "string" &&
      typeof row.provider_label === "string" &&
      typeof row.status === "string" &&
      REFRESH_STATUSES.has(row.status) &&
      isOptionalNullableString(row.provider_id) &&
      (row.model_count === undefined || typeof row.model_count === "number") &&
      isOptionalNullableString(row.fetched_at) &&
      isOptionalNullableString(row.detail)
    );
  });
}

/**
 * Refresh one, several, or (when `providerSlugs` is omitted) every supported
 * provider's model cache. Returns the server's per-provider summary — a
 * `missing_key` / `no_provider_row` / `failed` result is a normal ROW in
 * that summary, never a thrown error, so the caller can show it honestly
 * instead of hiding it. Returns `null` only when the request itself failed
 * (network, auth, 400 for an unrecognized slug).
 */
export const refreshProviderModels = (
  providerSlugs?: string[] | null,
): ThunkAction<
  Promise<ProviderModelsRefreshSummary | null>,
  RootState,
  unknown,
  UnknownAction
> => {
  return async (dispatch) => {
    // 🚨 NO scopeOverrides. This is a PLATFORM-scoped admin route: it reads no
    // organization at all, and the caller carries their own, exactly like any
    // other caller (common-docs/projects/no-db-assigned-org/PLAN.md — "an
    // administrator carries the same explicit target organization as an
    // ordinary caller"). Overriding the request scope to the Matrx System org
    // (copied from the row-OWNERSHIP pattern, where system-owned rows really
    // are homed there) made every Sync Now die with 400
    // `organization_forbidden`: nobody holds an iam.memberships row in that
    // org, and the admission gate proves membership on every request.
    const result = await dispatch(
      callApi({
        path: "/admin/ai-catalog/provider-models/refresh",
        method: "POST",
        body: { provider_slugs: providerSlugs ?? null },
      }),
    );
    if (result.error) {
      console.error(
        "[refreshProviderModels] backend provider-models refresh failed",
        result.error,
      );
      return null;
    }
    if (!isProviderModelsRefreshSummary(result.data)) {
      console.error(
        "[refreshProviderModels] backend returned an invalid refresh summary",
      );
      return null;
    }
    return result.data;
  };
};
