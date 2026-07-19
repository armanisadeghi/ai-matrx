/**
 * Canonical resource-reference wire contract for agent-bound context.
 *
 * A bare file_id remains the preferred default and means "the complete existing
 * resource family". This envelope is only needed when a caller promotes a
 * bounded preview or suppresses representations/capabilities for one run.
 * Neither operation requests generation; the server only discovers artifacts
 * that already exist.
 */

export interface ResourcePromotion {
  representation: string;
  max_chars?: number;
}

export interface AgentResourceReference {
  __kind: "resource_ref";
  resource_type: string;
  resource_id: string;
  promote?: ResourcePromotion | ResourcePromotion[];
  exclude?: string[];
}

export interface ResourceReferenceOptions {
  promote?: ResourcePromotion | ResourcePromotion[];
  exclude?: string[];
}

export function createResourceReference(
  resourceType: string,
  resourceId: string,
  options: ResourceReferenceOptions = {},
): AgentResourceReference {
  const exclude = Array.from(
    new Set(
      (options.exclude ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  return {
    __kind: "resource_ref",
    resource_type: resourceType,
    resource_id: resourceId,
    ...(options.promote ? { promote: options.promote } : {}),
    ...(exclude.length ? { exclude } : {}),
  };
}

export function promoteResource(
  reference: AgentResourceReference,
  representation: string,
  maxChars = 5_000,
): AgentResourceReference {
  const current = Array.isArray(reference.promote)
    ? reference.promote
    : reference.promote
      ? [reference.promote]
      : [];
  return {
    ...reference,
    promote: [
      ...current.filter((item) => item.representation !== representation),
      { representation, max_chars: maxChars },
    ],
  };
}

export function suppressResourceRepresentations(
  reference: AgentResourceReference,
  ...representations: string[]
): AgentResourceReference {
  return createResourceReference(reference.resource_type, reference.resource_id, {
    promote: reference.promote,
    exclude: [...(reference.exclude ?? []), ...representations],
  });
}

