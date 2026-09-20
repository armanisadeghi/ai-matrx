// lib/organizations/fetchWithOrganization.ts
//
// THE ONE WAY A BARE `fetch` TO ONE OF OUR OWN ROUTES CARRIES — AND ASKS FOR —
// THE ORGANIZATION.
//
// THE GAP THIS CLOSES (2026-09-19)
// --------------------------------
// The 2026-09-19 ruling took the `current_personal_org_id()` fallback out of
// five route handlers: `app/api/user/profile`, `app/api/user/email-preferences`,
// `app/api/sms/preferences`, `app/api/sms/verify` and
// `app/api/cms/access-context` used to let the SERVER file the write in the
// caller's personal workspace when the request named no organization. They now
// refuse, with a 400 whose body carries the caller's memberships.
//
// That is only half an answer, and the wrong half on its own. Every caller of
// those five routes is a hand-written `fetch` in a feature file — six of them,
// in `features/sms/hooks/useSmsEnrollment.ts`,
// `features/user-profile/hooks/useUserProfile.ts`,
// `features/settings/tabs/EmailTab.tsx`,
// `features/cms/services/cmsAccessRequests.ts` and
// `features/access-gate/service/accessDeniedContext.ts`. None of them sent
// `X-Organization-Id`, and none of them could recognise the refusal. Shipping
// the refusal without this would have turned a silent misfile into a permanent
// dead end: the request is refused, nothing asks the person anything, and
// retrying sends the identical request to be refused again forever. A refusal
// with no way to answer it is exactly the dead end that pushed every boot
// ladder in this codebase to GUESS an organization in the first place.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// So: hold, ask, resume — the same three beats `ensureOrgId` and the gate give
// every other action, applied at the ONE seam these six calls share.
//
//   1. Send with `X-Organization-Id` set to the organization the person has
//      SELECTED, if they have selected one. Nothing is substituted here: with
//      no selection the header is simply absent and the server refuses.
//   2. If the server answers the `organization_required` envelope, open the
//      picker through the ONE gate (`ensureOrganizationContext`). The person
//      SETS an organization; it becomes the active organization globally.
//   3. Replay the SAME request once with the organization they just named.
//
// Exactly once. A second refusal after the person has named an organization is
// a real failure — a membership they lost, a route that wants a different
// organization — and it is returned to the caller as the response it is,
// never turned into another dialog.
//
// Cancelling throws `OrganizationSelectionCancelled`, which the ~50 sites that
// already recognise it treat as "nothing happened": no toast, no error banner,
// no cleared form. A caller that does not catch it will see a rejected promise
// rather than a silent success, which is the honest failure.
//
// This deliberately does NOT go through `callApi`: that is the transport for
// the Python backend (`lib/api/call-api.ts`, `requireOrganizationContext`,
// `OrganizationContextError`) and is not in the path of a Next `/api/...`
// route. Same three beats, different wire.

import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import { isOrganizationRequiredEnvelope } from "@/lib/organizations/organizationRequiredError";

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

/**
 * True when this response is our own routes' "name an organization" refusal.
 *
 * Reads the body from a CLONE, so the caller's `response.json()` still works
 * whatever the answer — a recogniser that consumes the stream would break
 * every success path it was added to protect.
 */
async function isOrganizationRefusal(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    return isOrganizationRequiredEnvelope(await response.clone().json());
  } catch {
    // Not JSON, or already consumed: then it is not our envelope.
    return false;
  }
}

/**
 * `fetch` for one of our own `/api/...` routes that acts inside an
 * organization. Drop-in: same arguments, same `Response`.
 *
 * @param input  as `fetch`
 * @param init   as `fetch`
 */
export async function fetchWithOrganization(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const selected = getActiveOrgId();
  const response = await fetch(input, withOrganizationHeader(init, selected));
  if (!(await isOrganizationRefusal(response))) return response;

  // The server says this request needs an organization and names none. Ask.
  // The gate is imported here rather than at module scope so a caller that
  // never meets a refusal never pulls the picker's graph into its chunk.
  const { ensureOrganizationContext } = await import(
    "@/lib/organization/organization-gate"
  );
  // Throws `OrganizationSelectionCancelled` when the person declines, which is
  // an ANSWER ("not now") and is left to the caller to treat as nothing
  // happened — never swallowed into a silent success here.
  const chosen = await ensureOrganizationContext();

  // Replay once, and only once, with what they named.
  return fetch(input, withOrganizationHeader(init, chosen));
}
