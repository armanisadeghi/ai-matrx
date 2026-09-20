// lib/organizations/organizationRequiredError.ts
//
// The ONE recogniser for "this failed because no organization is selected".
//
// Every Matrx transport fails CLOSED when the user has not selected an
// organization — `requireOrganizationContext` in the package kernel and
// `requireSelectedOrgId` in `lib/organizations/activeOrg.ts` both throw
// `OrganizationContextError("organization_context_required", …)`. That is the
// right behaviour on the wire and the WRONG thing to put on a screen: its
// message ("Select an organization before sending this request.") is an
// instruction to a programmer, with no remedy and no way to choose.
//
// Law 4 — a screen is absent or honest, never lying or dead. So every surface
// that renders a caught error asks this function first, and when it says yes it
// renders `OrganizationRequiredNotice` (features/organizations/components)
// instead of the raw string: what happened, why, and the picker right there.

import { OrganizationContextError } from "@ai-matrx/agents/matrx";

/**
 * The wire code both servers answer a missing organization with: this repo's
 * `organizationRequiredResponse` (400) and aidream's `organization_for_request`.
 */
export const ORGANIZATION_REQUIRED_WIRE_CODE = "organization_required" as const;

/**
 * True when `err` is the fail-closed "no organization selected" refusal —
 * from the package transport kernel, from `requireSelectedOrgId`, or (since
 * 2026-09-19) from a Next route handler that refused rather than picking one.
 *
 * Matches by the error CLASS and code. It deliberately does NOT string-match
 * the message: a message match would silently rot the day the copy changes,
 * and both throw sites now raise the same typed error.
 */
export function isOrganizationRequiredError(err: unknown): boolean {
  if (
    err instanceof OrganizationContextError &&
    err.code === "organization_context_required"
  ) {
    return true;
  }
  // The SERVER-side half of the same refusal, added 2026-09-19.
  //
  // `OrganizationRequiredServerError` (lib/organizations/organizationRequiredResponse)
  // is what a Next route handler throws when the request needs an organization
  // and names none — the replacement for the `current_personal_org_id()`
  // fallback the 2026-09-19 ruling removed. It is the SAME condition as the
  // transport kernel's, raised on the other side of the wire, so it must reach
  // the same screen: the notice with the picker, never a raw string.
  //
  // Matched by its `code` rather than by `instanceof` so this module stays a
  // cycle-free leaf and so an error that crossed a serialization boundary —
  // rehydrated by a query client, re-thrown by a wrapper — is still
  // recognised. `organization_required` is also the code aidream's
  // `organization_for_request` answers with, so one recogniser covers both
  // servers.
  return (
    err instanceof Error &&
    (err as { code?: unknown }).code === ORGANIZATION_REQUIRED_WIRE_CODE
  );
}

/** One organization the refusal offers the person, as it arrives on the wire. */
export interface OrganizationRequiredWireMembership {
  id: string;
  name: string;
  abbreviation?: string;
}

/**
 * The parsed 400 BODY of an organization refusal — the form the condition
 * takes when it crosses a plain `fetch` instead of a throwing transport.
 *
 * ONE shape, from either server (unified 2026-09-19): routes under
 * `app/api/**` (`lib/organizations/organizationRequiredResponse.ts`) and
 * aidream's `organization_for_request` both answer
 * `{ error, code, message, user_message, details: { organizations, … } }` —
 * aidream's `matrx_connect.org_hold.organization_hold_detail` is the source of
 * truth for the field names; this repo's builder emits it field-for-field. A
 * caller that reads `response.json()` has no Error to hand
 * `isOrganizationRequiredError`, only this object — so it gets its own
 * recogniser rather than each call site string-matching `code` by hand and
 * drifting.
 *
 * Deliberately tolerant about `details.organizations`: it is `null` when the
 * server could not read the list, and the refusal is still the honest answer
 * — the client falls back to the picker's own list. Use
 * `extractOrganizationHoldMemberships` to read it uniformly, including from a
 * thrown `BackendApiError`/`ApiCallError` rather than a raw body.
 */
export function isOrganizationRequiredEnvelope(
  body: unknown,
): body is {
  code: typeof ORGANIZATION_REQUIRED_WIRE_CODE;
  message?: string;
  user_message?: string;
  details?: {
    organizations?: OrganizationRequiredWireMembership[] | null;
    memberships_url?: string;
    set_on?: string;
    remedy?: string;
  };
} {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === ORGANIZATION_REQUIRED_WIRE_CODE
  );
}

/**
 * The ONE reader for "what organizations does this refusal offer?" — works
 * whether `err` is aidream's `BackendApiError` (`.details.organizations`), the
 * Next envelope body (`.details.organizations`), or a `normalizeError`-shaped
 * `ApiCallError` (`.serverDetail.organizations`, since `serverDetail` carries
 * the raw wire body — see `lib/api/call-api.ts`'s `normalizeError`). Returns
 * `null` when absent OR unreadable, exactly matching the wire's own
 * null-means-"could not ask" convention — callers fall back to their own
 * membership fetch on `null`, never on `[]` (which is a real, honest "you
 * belong to nothing").
 */
export function extractOrganizationHoldMemberships(
  err: unknown,
): OrganizationRequiredWireMembership[] | null {
  if (!err || typeof err !== "object") return null;
  if ((err as { code?: unknown }).code !== ORGANIZATION_REQUIRED_WIRE_CODE) {
    return null;
  }
  const container = err as { details?: unknown; serverDetail?: unknown };
  return (
    readOrganizationsField(container.details) ??
    readOrganizationsField(container.serverDetail)
  );
}

function readOrganizationsField(
  details: unknown,
): OrganizationRequiredWireMembership[] | null {
  if (!details || typeof details !== "object") return null;
  const organizations = (details as { organizations?: unknown }).organizations;
  if (!Array.isArray(organizations)) return null;
  return organizations.filter(
    (org): org is OrganizationRequiredWireMembership =>
      !!org &&
      typeof org === "object" &&
      typeof (org as { id?: unknown }).id === "string" &&
      typeof (org as { name?: unknown }).name === "string",
  );
}
