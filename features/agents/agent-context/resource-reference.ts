/**
 * Canonical resource-reference wire contract for agent-bound context.
 *
 * A bare file_id remains the preferred default and means "the complete existing
 * resource family". This envelope is only needed when a caller promotes a
 * bounded preview or suppresses representations/capabilities for one run.
 * Neither operation requests generation; the server only discovers artifacts
 * that already exist.
 */

import {
  createSourceRef,
  type ResourcePromotion,
  type SourceRef,
  type SourceRefOptions,
} from "@ai-matrx/agents/sources";

export type { ResourcePromotion };

/**
 * The pointer IS `SourceRef` from `@ai-matrx/agents/sources` (the one Source
 * payload, contract v1) — never a second pointer type. This alias keeps the
 * agent-context vocabulary for existing callers.
 */
export type AgentResourceReference = SourceRef;

export type ResourceReferenceOptions = SourceRefOptions;

export function createResourceReference(
  resourceType: string,
  resourceId: string,
  options: ResourceReferenceOptions = {},
): AgentResourceReference {
  return createSourceRef(resourceType, resourceId, options);
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
  return createResourceReference(
    reference.resource_type,
    reference.resource_id,
    {
      ...reference,
      exclude: [...(reference.exclude ?? []), ...representations],
    },
  );
}
