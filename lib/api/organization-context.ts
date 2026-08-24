/**
 * One fail-closed organization-context kernel for every frontend transport.
 *
 * Transport adapters resolve their authoritative organization first, then use
 * these functions to bind that exact value without guessing or defaulting.
 */

export type OrganizationContextErrorCode =
  | "organization_context_required"
  | "organization_context_invalid"
  | "organization_context_mismatch";

export class OrganizationContextError extends Error {
  readonly code: OrganizationContextErrorCode;

  constructor(code: OrganizationContextErrorCode, message: string) {
    super(message);
    this.name = "OrganizationContextError";
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireOrganizationContext(
  selectedOrganizationId: string | null | undefined,
  overrideOrganizationId?: string,
): string {
  const candidate = overrideOrganizationId ?? selectedOrganizationId;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new OrganizationContextError(
      "organization_context_required",
      "Select an organization before sending this request.",
    );
  }

  const normalized = candidate.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrganizationContextError(
      "organization_context_invalid",
      "The selected organization ID is invalid.",
    );
  }
  return normalized.toLowerCase();
}

export function applyOrganizationContextHeader(
  headers: Record<string, string>,
  organizationId: string,
): Record<string, string> {
  const normalizedOrganizationId = requireOrganizationContext(organizationId);
  for (const [name, value] of Object.entries(headers)) {
    if (
      name.toLowerCase() === "x-organization-id" &&
      value.trim().toLowerCase() !== normalizedOrganizationId
    ) {
      throw new OrganizationContextError(
        "organization_context_mismatch",
        "X-Organization-Id must match the request context organization.",
      );
    }
  }
  const withoutOrganizationHeader = Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== "x-organization-id",
    ),
  );
  return {
    ...withoutOrganizationHeader,
    "X-Organization-Id": normalizedOrganizationId,
  };
}

export function assertQueryOrganizationMatchesContext(
  queryParams: Record<string, string | number | boolean> | undefined,
  organizationId: string,
): void {
  if (!queryParams || queryParams.organization_id === undefined) return;
  const queryOrganizationId = requireOrganizationContext(
    String(queryParams.organization_id),
  );
  if (queryOrganizationId !== requireOrganizationContext(organizationId)) {
    throw new OrganizationContextError(
      "organization_context_mismatch",
      "Query organization_id must match the request context organization.",
    );
  }
}
