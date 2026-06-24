/**
 * Action Catalog — the one fetch path to the live backend.
 *
 * Calls `GET {baseUrl}/actions/catalog` on the Python brain. The base URL is
 * NEVER hardcoded — it is resolved from the canonical `apiConfigSlice`
 * (`selectResolvedBaseUrl`), the same value every other backend call in the app
 * reads, so the admin server toggle routes this too. The catalog is
 * non-sensitive and unauthenticated, so no auth headers are attached.
 */

import { ENDPOINTS_ACTIONS } from "@/features/action-catalog/endpoints";
import { isActionCatalog, type ActionCatalog } from "@/features/action-catalog/types";

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
