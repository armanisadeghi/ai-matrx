// features/education/convert/trustMerge.ts
//
// Roll several per-item TrustEnvelopes (e.g. one per flashcard) up into a
// single artifact-level envelope for the kit results chip. Confidence is the
// honest worst-case-aware roll-up; citations are de-duplicated and capped.

import type {
  TrustEnvelope,
  TrustConfidence,
  SourceCitation,
} from "@/features/education/trust/types";

const MAX_CITATIONS = 8;

/**
 * Merge many envelopes into one. Confidence rules (honest, never inflated):
 *   • "grounded" only if at least one item is grounded AND none is not_in_material
 *   • "not_in_material" if every item is not_in_material (or there are none)
 *   • "inferred" otherwise
 */
export function mergeTrustEnvelopes(
  envelopes: (TrustEnvelope | null | undefined)[],
): TrustEnvelope | null {
  const present = envelopes.filter((e): e is TrustEnvelope => !!e);
  if (present.length === 0) return null;

  const anyGrounded = present.some((e) => e.confidence === "grounded");
  const allNotInMaterial = present.every(
    (e) => e.confidence === "not_in_material",
  );
  const anyNotInMaterial = present.some(
    (e) => e.confidence === "not_in_material",
  );

  let confidence: TrustConfidence;
  if (allNotInMaterial) confidence = "not_in_material";
  else if (anyGrounded && !anyNotInMaterial) confidence = "grounded";
  else confidence = "inferred";

  const seen = new Set<string>();
  const citations: SourceCitation[] = [];
  for (const e of present) {
    for (const c of e.citations ?? []) {
      const key = `${c.sourceId}|${c.locator ?? ""}|${(c.excerpt ?? "").slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push(c);
      if (citations.length >= MAX_CITATIONS) break;
    }
    if (citations.length >= MAX_CITATIONS) break;
  }

  const groundedIn = present.find((e) => e.groundedIn)?.groundedIn;
  return { citations, confidence, groundedIn };
}
