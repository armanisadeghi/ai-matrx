/**
 * The fail-closed organization-context kernel MOVED into the published
 * package (`@ai-matrx/agents/matrx`, 0.6.0 — the C22 retrofit): one
 * implementation for every Matrx client transport, re-exported here so the
 * app's existing import sites (`callApi`, the transports, tests) keep their
 * path. Do not add logic here — grow the package.
 */

export {
  applyOrganizationContextHeader,
  assertQueryOrganizationMatchesContext,
  OrganizationContextError,
  requireOrganizationContext,
  type OrganizationContextErrorCode,
} from "@ai-matrx/agents/matrx";
