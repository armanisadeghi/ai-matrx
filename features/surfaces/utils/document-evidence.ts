/**
 * Document Evidence System activation for code-first UI surfaces.
 *
 * A surface that already knows a `processed_document_id` should never rely on
 * an agent-specific variable mapping to make the document's clean/raw/page/RAG
 * representations available. This resolver turns manifest `evidenceSources`
 * into the canonical source-only context shape consumed by aidream's
 * `ProcessedDocumentResolver`.
 */

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { getManifest } from "@/features/surfaces/manifests/registry";

const ATTACHED_DOCUMENT_KEY_PREFIX = "attached_document_";

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contextRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

/**
 * Add every manifest-declared evidence source to `applicationScope.context`.
 * Existing unrelated context is preserved; the canonical evidence key wins so
 * a malformed same-key caller value cannot silently disable the guarantee.
 */
export function withSurfaceDocumentEvidence(
  surfaceName: string,
  applicationScope: ApplicationScope,
): ApplicationScope {
  const manifest = getManifest(surfaceName);
  if (!manifest?.evidenceSources?.length) return applicationScope;

  const evidenceContext: Record<string, unknown> = {};
  for (const declaration of manifest.evidenceSources) {
    if (declaration.kind !== "processed_document") continue;

    const documentId = nonEmptyString(applicationScope[declaration.idValue]);
    if (!documentId) continue;

    const fileId = declaration.fileIdValue
      ? nonEmptyString(applicationScope[declaration.fileIdValue])
      : null;
    const label = declaration.labelValue
      ? nonEmptyString(applicationScope[declaration.labelValue])
      : null;
    const key = `${ATTACHED_DOCUMENT_KEY_PREFIX}${documentId}`;

    evidenceContext[key] = {
      source: {
        kind: "processed_document",
        id: documentId,
        ...(declaration.representation
          ? { representation: declaration.representation }
          : {}),
        extra: {
          attached_as: "surface",
          surface_name: surfaceName,
          ...(fileId ? { file_id: fileId } : {}),
        },
      },
      type: "json",
      label: label ?? "Surface document",
      description:
        "Document Evidence System source supplied by the active surface.",
    };
  }

  if (Object.keys(evidenceContext).length === 0) return applicationScope;

  return {
    ...applicationScope,
    context: {
      ...contextRecord(applicationScope.context),
      ...evidenceContext,
    },
  };
}
