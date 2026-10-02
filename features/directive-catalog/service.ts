/**
 * Directive Catalog — the one fetch path to the live backend.
 *
 * Calls `GET {baseUrl}/directives/catalog` on the Python brain. The base URL is
 * NEVER hardcoded — it is resolved from the canonical `apiConfigSlice`
 * (`selectResolvedBaseUrl`), the same value every other backend call in the app
 * reads, so the admin server toggle routes this too. The catalog is
 * non-sensitive and unauthenticated, so no auth headers are attached.
 */

import { supabase } from "@/utils/supabase/client";

import { ENDPOINTS_DIRECTIVES } from "@/features/directive-catalog/endpoints";
import {
  isDirectiveApplyResult,
  isDirectiveApplyStateResult,
  isDirectiveCatalog,
  isDirectiveConfirmResult,
  type DirectiveApplyResult,
  type DirectiveCatalog,
  type DirectiveExecuteRequest,
  type DirectiveConfirmRequest,
  type DirectiveConfirmResult,
  type DirectiveApplyStateRequest,
  type DirectiveApplyStateResult,
} from "@/features/directive-catalog/types";
import { parseHttpError } from "@/lib/api/errors";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { ensureOrganizationForRequest } from "@/lib/organization/organization-gate";

/**
 * Organization admission rides with auth: the server's AuthMiddleware
 * (matrx-connect, 2026-08-30) refuses any authenticated request that names no
 * organization via `X-Organization-Id`. Both directive writes are identified
 * (Bearer JWT), so the selected organization is resolved out of Redux and run
 * through the ONE fail-closed kernel — a missing organization throws
 * `OrganizationContextError` BEFORE any networking, matching the server's
 * `organization_required` 400 gate one hop earlier (same pattern as
 * `features/scheduling/service/schedulerClient.ts`).
 */
async function authedDirectiveHeaders(
  token: string,
): Promise<Record<string, string>> {
  // ORG-GATE-AUDIT: THE GATE, never the bare kernel — every directive call is
  // a write the person pressed, so with no organization selected it asks, then
  // continues this same request instead of throwing a bare refusal.
  //
  // `personWrite` (LANE-B, 2026-10-02): the server runs every directive as the
  // PERSON, under their own row security, so it lands in the organization they
  // selected — on an admin page too. The admin section's platform tenant is for
  // seat work; binding it here stamped a person's task into Matrx System while
  // the switcher on the same screen named their own workspace.
  const organizationId = await ensureOrganizationForRequest({
    method: "POST",
    personWrite: true,
  });
  return applyOrganizationContextHeader(
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    organizationId,
  );
}

const trimRoot = (baseUrl: string): string =>
  baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

/**
 * Fetch the live directive catalog from `baseUrl`. Throws a structured Error on a
 * missing base, a non-2xx response, or a malformed payload (loud failure — the
 * admin page surfaces it). `signal` lets callers abort a stale poll.
 */
export async function fetchDirectiveCatalog(
  baseUrl: string | undefined,
  signal?: AbortSignal,
): Promise<DirectiveCatalog> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured. Set the active server (apiConfigSlice) / NEXT_PUBLIC_BACKEND_URL_* env var.",
    );
  }
  const root = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${root}${ENDPOINTS_DIRECTIVES.catalog}`;

  const response = await fetch(url, { method: "GET", signal });
  if (!response.ok) {
    throw new Error(
      `Directive catalog request failed: HTTP ${response.status} ${response.statusText} (${url})`,
    );
  }

  const payload: unknown = await response.json();
  if (!isDirectiveCatalog(payload)) {
    throw new Error(
      `Directive catalog response was malformed (missing directive_version / nouns) from ${url}`,
    );
  }
  return payload;
}

/**
 * Run ONE `verb:noun` action via `POST {baseUrl}/directives/execute`. AUTHED — the
 * write runs as the user (RLS) on the server, so we attach the Supabase JWT (same
 * session client the reference resolvers use). Throws a structured Error on a
 * missing base / no session / a malformed payload, and `BackendApiError` on a
 * non-2xx (`userMessage` for the person, `detail` for the log) — the panel
 * shows it. Returns the per-item receipts.
 */
export async function executeDirective(
  baseUrl: string | undefined,
  body: DirectiveExecuteRequest,
): Promise<DirectiveApplyResult> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).",
    );
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error(
      "Not signed in — an action write needs an authenticated session.",
    );
  }
  const url = `${trimRoot(baseUrl)}${ENDPOINTS_DIRECTIVES.execute}`;

  const response = await fetch(url, {
    method: "POST",
    headers: await authedDirectiveHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // One parser for every backend refusal: the person reads `userMessage`,
    // the technical `detail` stays behind it. (A hand-rolled `String(detail)`
    // here printed "[object Object]" for FastAPI's structured detail.)
    throw await parseHttpError(response);
  }

  const payload: unknown = await response.json();
  if (!isDirectiveApplyResult(payload)) {
    throw new Error(
      `Execute response was malformed (missing type / applied / receipts) from ${url}`,
    );
  }
  return payload;
}

/**
 * Apply a directive an agent PROPOSED under the `ask` policy, once the user
 * accepts it (the approve button on a `directive_apply.proposed` card). AUTHED —
 * the write runs as the user (RLS) on the server. `body` is the round-tripped
 * envelope the proposal carried; idempotent by `proposal_id` (a double-accept is
 * a no-op). Throws `BackendApiError` on non-2xx (UI should show
 * ``userMessage`` — never the technical ``detail``). Same JWT path as
 * `executeDirective` — never writes Supabase.
 */
export async function confirmDirective(
  baseUrl: string | undefined,
  body: DirectiveConfirmRequest,
): Promise<DirectiveConfirmResult> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).",
    );
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error(
      "Not signed in — confirming an action needs an authenticated session.",
    );
  }
  const url = `${trimRoot(baseUrl)}${ENDPOINTS_DIRECTIVES.confirm}`;

  const response = await fetch(url, {
    method: "POST",
    headers: await authedDirectiveHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseHttpError(response);
  }

  const payload: unknown = await response.json();
  if (!isDirectiveConfirmResult(payload)) {
    throw new Error(
      `Confirm response was malformed (missing type / proposal_id / receipts) from ${url}`,
    );
  }
  return payload;
}


/**
 * DD-144 — ask the server whether these proposed directives have already been
 * applied. A READ; nothing here writes.
 *
 * WHY IT IS A ROUND TRIP AT ALL. After a reload the two-key shell is still there
 * (it IS the assistant message's stored text), but whether it was applied is
 * decided by `content_key`, which aidream's `keys.py` declares FROZEN and which
 * hashes the VALIDATED item model. A client cannot reproduce that, and a client
 * that guessed would render an Approve button beside that proposal's own receipt.
 * So the identity stays with its one author and we ask.
 *
 * `conversation_id` is REQUIRED and is not decoration: it is the idempotency
 * NAMESPACE, so a state read without it would ask about different keys than the
 * Approve button will run.
 */
export async function fetchDirectiveApplyState(
  baseUrl: string | undefined,
  body: DirectiveApplyStateRequest,
): Promise<DirectiveApplyStateResult> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).",
    );
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error(
      "Not signed in — reading what this conversation's actions did needs an authenticated session.",
    );
  }
  const url = `${trimRoot(baseUrl)}${ENDPOINTS_DIRECTIVES.applyState}`;

  const response = await fetch(url, {
    method: "POST",
    headers: await authedDirectiveHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await parseHttpError(response);

  const payload: unknown = await response.json();
  if (!isDirectiveApplyStateResult(payload)) {
    throw new Error(
      `The apply-state response was malformed (missing conversation_id / shells) from ${url}`,
    );
  }
  return payload;
}
