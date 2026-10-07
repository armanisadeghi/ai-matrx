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
  isDirectiveNounSchemas,
  type DirectiveApplyResult,
  type DirectiveCatalog,
  type DirectiveNounSchemas,
  type DirectiveExecuteRequest,
  type DirectiveConfirmRequest,
  type DirectiveConfirmResult,
  type DirectiveApplyStateRequest,
  type DirectiveApplyStateResult,
} from "@/features/directive-catalog/types";
import {
  buildMatrxRequestUrl,
  readMatrxJsonResponse,
  sendMatrxRequest,
} from "@ai-matrx/agents/matrx";
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
  options: { interactive?: boolean } = {},
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
  //
  // A background READ (the ledger state a card reads on mount) passes
  // `interactive: false`: nobody pressed anything, so it refuses quietly rather
  // than raise a picker out of nowhere.
  const organizationId = await ensureOrganizationForRequest({
    method: "POST",
    personWrite: true,
    interactive: options.interactive,
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

/** Own header policy (person-write organization gate, caller-resolved base),
 * so the core sends: URL assembly, the send, and one classified
 * BackendApiError for any non-2xx. */
async function postDirective(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await sendMatrxRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readMatrxJsonResponse<unknown>(response);
}

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
  const url = buildMatrxRequestUrl(trimRoot(baseUrl), ENDPOINTS_DIRECTIVES.catalog);

  const response = await sendMatrxRequest(url, { method: "GET" }, { signal });
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
 * Fetch ONE noun's write item schemas (`GET {baseUrl}/directives/catalog/{noun}`)
 * — the summary catalog carries none. Public, unauthenticated, ETag-cached by
 * the browser. Throws on a missing base, a non-2xx (404 = the catalog lists no
 * such noun), or a malformed payload.
 */
export async function fetchDirectiveNounSchemas(
  baseUrl: string | undefined,
  noun: string,
  signal?: AbortSignal,
): Promise<DirectiveNounSchemas> {
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured. Set the active server (apiConfigSlice) / NEXT_PUBLIC_BACKEND_URL_* env var.",
    );
  }
  const url = buildMatrxRequestUrl(
    trimRoot(baseUrl),
    ENDPOINTS_DIRECTIVES.nounSchemas(noun),
  );
  const response = await sendMatrxRequest(url, { method: "GET" }, { signal });
  if (!response.ok) {
    throw new Error(
      `Directive schemas request failed: HTTP ${response.status} ${response.statusText} (${url})`,
    );
  }
  const payload: unknown = await response.json();
  if (!isDirectiveNounSchemas(payload)) {
    throw new Error(
      `Directive schemas response was malformed (missing noun / schemas) from ${url}`,
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
  const url = buildMatrxRequestUrl(trimRoot(baseUrl), ENDPOINTS_DIRECTIVES.execute);

  // One parser for every backend refusal: the person reads `userMessage`,
  // the technical `detail` stays behind it.
  const payload = await postDirective(
    url,
    await authedDirectiveHeaders(token),
    body,
  );
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
  const url = buildMatrxRequestUrl(trimRoot(baseUrl), ENDPOINTS_DIRECTIVES.confirm);

  const payload = await postDirective(
    url,
    await authedDirectiveHeaders(token),
    body,
  );
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
 * `conversation_id` is the idempotency NAMESPACE and must match the apply it
 * asks about: send the conversation for an agent's proposal; OMIT it for a block
 * in a person's own content, which `confirm` applies in the person's namespace
 * (aidream `keys.human_door_namespace` — one rule for both doors).
 *
 * `interactive: false` for a background read (a card mounting): never raise the
 * organization picker when nobody pressed anything.
 */
export async function fetchDirectiveApplyState(
  baseUrl: string | undefined,
  body: DirectiveApplyStateRequest,
  options: { interactive?: boolean } = {},
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
  const url = buildMatrxRequestUrl(trimRoot(baseUrl), ENDPOINTS_DIRECTIVES.applyState);

  const payload = await postDirective(
    url,
    await authedDirectiveHeaders(token, options),
    body,
  );
  if (!isDirectiveApplyStateResult(payload)) {
    throw new Error(
      `The apply-state response was malformed (missing conversation_id / shells) from ${url}`,
    );
  }
  return payload;
}
