import type { ContentTransferReferencePort } from "@ai-matrx/design-system/content-transfer";
import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import type { NounDirectives } from "@/features/directive-catalog/types";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";

function requireBaseUrl(): string {
  const store = getStoreSingleton();
  const baseUrl = store
    ? selectResolvedBaseUrl(
        store.getState() as Parameters<typeof selectResolvedBaseUrl>[0],
      )
    : undefined;
  if (!baseUrl) {
    throw new Error("Cannot copy this reference: no backend server is configured.");
  }
  return baseUrl;
}

function referenceIdentityFields(
  nouns: NounDirectives[],
  noun: string,
): string[] {
  const catalogNoun = nouns.find((candidate) => candidate.noun === noun);
  if (!catalogNoun || catalogNoun.reference !== "yes") {
    throw new Error(
      `Cannot copy this reference: "${noun}" is not a registered reference noun.`,
    );
  }
  const identityFields = catalogNoun.identity_fields;
  if (!identityFields?.length) {
    throw new Error(
      `Cannot copy this reference: "${noun}" has no registered reference identity fields.`,
    );
  }
  return identityFields;
}

/**
 * Validate against the live directive catalog. Reference identity fields are
 * canonical there; `schemas` only describe write payloads.
 */
async function validateReference(
  noun: string,
  items: Record<string, unknown>[],
): Promise<void> {
  let catalog;
  try {
    catalog = await fetchDirectiveCatalog(requireBaseUrl());
  } catch (error) {
    throw new Error(
      `Cannot copy this reference: could not load the directive catalog (${error instanceof Error ? error.message : String(error)}).`,
    );
  }

  const identityFields = referenceIdentityFields(catalog.nouns, noun);
  if (
    items.some((item) =>
      identityFields.some(
        (field) => typeof item[field] !== "string" || !item[field].trim(),
      ),
    )
  ) {
    throw new Error("Cannot copy this reference: reference identity is incomplete.");
  }

  // Extra id-shaped values are also identities, even when they are not part of
  // this noun's primary identity tuple.
  if (
    items.some((item) =>
      Object.entries(item).some(
        ([key, value]) =>
          (key === "id" || key.endsWith("_id")) &&
          (typeof value !== "string" || !value.trim()),
      ),
    )
  ) {
    throw new Error("Cannot copy this reference: reference identity is incomplete.");
  }
}

/** The live directive catalog validates the canonical fence before it is copied. */
export const alchemyReferencePort: ContentTransferReferencePort = {
  supports: (reference) => Boolean(reference.noun && reference.items.length),
  async build(reference) {
    await validateReference(reference.noun, reference.items);
    return buildReferenceFence({
      type: reference.noun,
      items: reference.items as ReferenceItem[],
    });
  },
};
