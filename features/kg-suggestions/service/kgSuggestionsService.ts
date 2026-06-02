// features/kg-suggestions/service/kgSuggestionsService.ts
//
// Typed client for the aidream /kg-suggestions router
// (aidream/api/routers/kg_suggestions.py, bare prefix `/kg-suggestions`,
// public URL `/api/kg-suggestions/*`).
//
// React → Python directly via the canonical `@/lib/python-client` wrapper
// (attaches the Supabase JWT as `Authorization: Bearer …` on every call —
// per CLAUDE.md, no Next.js middle hop). These are USER-scoped: the backend
// reads/decides on the caller's own suggestions via `ctx.user_id`; another
// user's suggestion 404s. Keep these shapes in sync with the Pydantic models.

import { getJson, postJson } from "@/lib/python-client";
import type {
  KgAcceptResult,
  KgDecisionResponse,
  KgSuggestionsListParams,
  KgSuggestionsPage,
} from "../types";

function buildQuery(
  params: Record<string, string | number | null | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && `${value}` !== "") {
      qs.set(key, `${value}`);
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** GET /kg-suggestions — paginated list, filtered by status/scope-item/source. */
export async function listKgSuggestions(
  params: KgSuggestionsListParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgSuggestionsPage> {
  const query = buildQuery({
    status: params.status ?? "pending",
    scope_item_id: params.scopeItemId,
    source_kind: params.sourceKind,
    source_id: params.sourceId,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
  const { data } = await getJson<KgSuggestionsPage>(
    `/kg-suggestions${query}`,
    { signal: opts.signal },
  );
  return data;
}

/**
 * POST /kg-suggestions/{id}/accept — the explicit "apply this suggestion"
 * action. Takes NO request body (verified against the live backend contract,
 * 2026-06-02: `aidream/api/routers/kg_suggestions.py::accept_suggestion`).
 *
 * The backend branches on the suggestion's `match_kind` and the response is a
 * discriminated union (`KgAcceptResult`):
 *  - slot-fill (exact/fuzzy/semantic) → writes `suggested_value` into the
 *    target scope-item slot and returns `KgAcceptResponse` (carries `value`).
 *  - `heavy_hitter` → flips the suggestion to `accepted` server-side and
 *    returns a `KgHeavyHitterAcceptPlan` (`kind: "heavy_hitter_plan"`). Scope
 *    creation is a frontend-owned write path (React → Supabase direct, per the
 *    scopes invariant), so the backend hands back a plan instead of creating
 *    the scope itself. The FE creates the scope and tags the plan's source
 *    mentions — see `useHeavyHitterAccept`.
 *
 * Either branch returns 409 if the suggestion was already accepted.
 */
export async function acceptKgSuggestion(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<KgAcceptResult> {
  const { data } = await postJson<KgAcceptResult, undefined>(
    `/kg-suggestions/${encodeURIComponent(id)}/accept`,
    undefined,
    { signal: opts.signal },
  );
  return data;
}

/** POST /kg-suggestions/{id}/reject — status=rejected, 30-day suppression. */
export async function rejectKgSuggestion(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<KgDecisionResponse> {
  const { data } = await postJson<KgDecisionResponse, undefined>(
    `/kg-suggestions/${encodeURIComponent(id)}/reject`,
    undefined,
    { signal: opts.signal },
  );
  return data;
}

/** POST /kg-suggestions/{id}/defer — status=deferred, 7-day suppression. */
export async function deferKgSuggestion(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<KgDecisionResponse> {
  const { data } = await postJson<KgDecisionResponse, undefined>(
    `/kg-suggestions/${encodeURIComponent(id)}/defer`,
    undefined,
    { signal: opts.signal },
  );
  return data;
}
