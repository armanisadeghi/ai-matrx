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
  KgAcceptResponse,
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
 * POST /kg-suggestions/{id}/accept — writes the suggested value into the
 * user's scope-item slot and returns the updated suggestion + new cell value.
 *
 * The LIVE backend contract (read 2026-06-02) takes NO request body: a
 * slot-fill suggestion writes `suggested_value` into its target slot. A
 * `heavy_hitter` suggestion (target_scope_id/target_scope_item_id NULL)
 * currently returns 422 ("creates a scope, not a cell value — not yet
 * supported here"). The optional `body` param is reserved for the Phase E
 * scope-creation contract (e.g. a chosen scope_type); it is sent verbatim if
 * provided so this client doesn't need a breaking change once Phase E lands.
 * TODO(Phase E): once the heavy_hitter accept contract is defined, type
 * `body` concretely instead of the permissive shape below.
 */
export async function acceptKgSuggestion(
  id: string,
  body?: KgAcceptBody,
  opts: { signal?: AbortSignal } = {},
): Promise<KgAcceptResponse> {
  const { data } = await postJson<KgAcceptResponse, KgAcceptBody | undefined>(
    `/kg-suggestions/${encodeURIComponent(id)}/accept`,
    body,
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

/**
 * Reserved accept body for the Phase E heavy-hitter scope-creation flow.
 * The current backend ignores any body for slot-fill accepts and rejects
 * heavy_hitter accepts entirely. When Phase E lands the create-scope path,
 * this is where `scope_type_id` (and friends) will be typed.
 */
export interface KgAcceptBody {
  /** Phase E: the scope_type the user chose when promoting a heavy hitter. */
  scope_type_id?: string;
}
