/**
 * Action Catalog — the one fetch path to the live backend.
 *
 * Calls `GET {baseUrl}/actions/catalog` on the Python brain. The base URL is
 * NEVER hardcoded — it is resolved from the canonical `apiConfigSlice`
 * (`selectResolvedBaseUrl`), the same value every other backend call in the app
 * reads, so the admin server toggle routes this too. The catalog is
 * non-sensitive and unauthenticated, so no auth headers are attached.
 */

import { supabase } from "@/utils/supabase/client";

import { ENDPOINTS_ACTIONS } from "@/features/action-catalog/endpoints";
import {
  isActionApplyResult,
  isActionCatalog,
  isDirectiveConfirmResult,
  type ActionApplyResult,
  type ActionCatalog,
  type ActionExecuteRequest,
  type DirectiveConfirmRequest,
  type DirectiveConfirmResult,
} from "@/features/action-catalog/types";

const trimRoot = (baseUrl: string): string =>
  baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

/**
 * Fetch the live action catalog from `baseUrl`. Throws a structured Error on a
 * missing base, a non-2xx response, or a malformed payload (loud failure — the
 * admin page surfaces it). `signal` lets callers abort a stale poll.
 */
export async function fetchActionCatalog(
  baseUrl: string | undefined,
  signal?: AbortSignal,
): Promise<ActionCatalog> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured. Set the active server (apiConfigSlice) / NEXT_PUBLIC_BACKEND_URL_* env var.",
    );
  }
  const root = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${root}${ENDPOINTS_ACTIONS.catalog}`;

  const response = await fetch(url, { method: "GET", signal });
  if (!response.ok) {
    throw new Error(
      `Action catalog request failed: HTTP ${response.status} ${response.statusText} (${url})`,
    );
  }

  const payload: unknown = await response.json();
  if (!isActionCatalog(payload)) {
    throw new Error(
      `Action catalog response was malformed (missing matrx_version / verbs / nouns) from ${url}`,
    );
  }
  return payload;
}

/**
 * Run ONE `verb:noun` action via `POST {baseUrl}/actions/execute`. AUTHED — the
 * write runs as the user (RLS) on the server, so we attach the Supabase JWT (same
 * session client the reference resolvers use). Throws a structured Error on a
 * missing base / no session / non-2xx (surfacing the server's `detail`) / a
 * malformed payload — the panel shows it. Returns the per-item receipts.
 */
export async function executeAction(
  baseUrl: string | undefined,
  body: ActionExecuteRequest,
): Promise<ActionApplyResult> {
  if (!baseUrl) {
    throw new Error("No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).");
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Not signed in — an action write needs an authenticated session.");
  }
  const url = `${trimRoot(baseUrl)}${ENDPOINTS_ACTIONS.execute}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const err: unknown = await response.json();
      if (err && typeof err === "object" && "detail" in err) {
        detail = String((err as { detail: unknown }).detail);
      }
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(`Execute failed: ${detail}`);
  }

  const payload: unknown = await response.json();
  if (!isActionApplyResult(payload)) {
    throw new Error(`Execute response was malformed (missing type / applied / receipts) from ${url}`);
  }
  return payload;
}

/**
 * Apply a directive an agent PROPOSED under the `ask` policy, once the user
 * accepts it (the approve button on a `directive_apply.proposed` card). AUTHED —
 * the write runs as the user (RLS) on the server. `body` is the round-tripped
 * envelope the proposal carried; idempotent by `proposal_id` (a double-accept is
 * a no-op). Throws a structured Error on a missing base / no session / non-2xx /
 * malformed payload. Same JWT path as `executeAction` — never writes Supabase.
 */
export async function confirmDirective(
  baseUrl: string | undefined,
  body: DirectiveConfirmRequest,
): Promise<DirectiveConfirmResult> {
  if (!baseUrl) {
    throw new Error("No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).");
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Not signed in — confirming an action needs an authenticated session.");
  }
  const url = `${trimRoot(baseUrl)}${ENDPOINTS_ACTIONS.confirm}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const err: unknown = await response.json();
      if (err && typeof err === "object" && "detail" in err) {
        detail = String((err as { detail: unknown }).detail);
      }
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(`Confirm failed: ${detail}`);
  }

  const payload: unknown = await response.json();
  if (!isDirectiveConfirmResult(payload)) {
    throw new Error(`Confirm response was malformed (missing type / proposal_id / receipts) from ${url}`);
  }
  return payload;
}
