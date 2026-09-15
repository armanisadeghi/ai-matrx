import { buildDirectiveSlug, buildKindDirective } from "@ai-matrx/content-ir";
import type { ContentTransferReferencePort } from "@ai-matrx/design-system/content-transfer";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";
import { validateAgainstKind } from "@/features/content-ir/registry/validate-against-kind";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";

/** Registry validation and the canonical fence builder, never a second envelope format. */
export const alchemyReferencePort: ContentTransferReferencePort = {
  supports: (reference) => Boolean(reference.noun && reference.items.length),
  async build(reference) {
    const slug = buildDirectiveSlug("reference", reference.noun);
    const shell = buildKindDirective(slug, reference.items);
    const result = await validateAgainstKind(shell, slug);
    if (!result.checked || !result.ok) throw new Error(`Cannot copy this reference: ${result.errors.join("; ")}`);
    // Registry string identities must also be nonempty; the generic schema permits empty strings.
    if (reference.items.some((item) => Object.entries(item).some(([key, value]) => (key === "id" || key.endsWith("_id")) && (typeof value !== "string" || !value.trim())))) {
      throw new Error("Reference identity is incomplete.");
    }
    return buildReferenceFence({ type: reference.noun, items: reference.items as ReferenceItem[] });
  },
};
