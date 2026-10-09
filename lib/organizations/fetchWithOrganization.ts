// lib/organizations/fetchWithOrganization.ts
//
// THE ONE WAY A BARE `fetch` TO ONE OF OUR OWN ROUTES CARRIES THE ORGANIZATION.
//
// The request names the organization it runs in on `X-Organization-Id`:
//   1. the record's own organization when the caller passes it (acting on a
//      record never switches the active organization);
//   2. otherwise the ACTIVE organization. A write waits for the load ladder
//      (`ensureOrgId`) so it never leaves on a painted cache; a read carries
//      whatever is selected (reads are exempt from the wait).
//
// Our routes still refuse a request that names no organization
// (`organization_required`). That refusal is returned to the caller as the
// response it is — never replayed, never turned into a prompt — and the
// caller's own error surface renders it honestly.

import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

/** The header every Matrx client carries; see app/api/_lib/apply-scope-to-insert.ts. */
const ORGANIZATION_HEADER = "X-Organization-Id";

function withOrganizationHeader(
  init: RequestInit | undefined,
  organizationId: string | null,
): RequestInit {
  const headers = new Headers(init?.headers);
  if (organizationId) headers.set(ORGANIZATION_HEADER, organizationId);
  else headers.delete(ORGANIZATION_HEADER);
  return { ...init, headers };
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * `fetch` for one of our own `/api/...` routes that acts inside an
 * organization. Drop-in: same arguments, same `Response`.
 */
export async function fetchWithOrganization(
  input: RequestInfo | URL,
  init?: RequestInit,
  /**
   * PER-CALL ORGANIZATION (active-org law 2026-09-30, rule 3). A call about an EXISTING record
   * passes THAT RECORD'S own organization here; it rides as `X-Organization-Id` in place of the
   * active one, exactly like `callApi`'s `scopeOverrides.organization_id`. Omit it for new work,
   * which is saved in the active organization.
   */
  options?: { organizationId?: string | null },
): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const selected =
    options?.organizationId ||
    (READ_METHODS.has(method) ? getActiveOrgId() : await ensureOrgId(null));
  return fetch(input, withOrganizationHeader(init, selected)); // org-filter: server-call the organization the request runs in: the record's own when named, else the active one
}
