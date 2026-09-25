// features/mandates/feature-intelligence/registry.ts
//
// EVERY FEATURE WITH AN INTELLIGENCE PAGE — the declared places maps, one per
// feature, each kept true by a test that reads its call sites
// (`__tests__/declared-places.test.ts`, plus flashcards' and research's own).
// Pure data: the service, the places resolver and the /intelligence index all
// read it. Add a feature here beside its map.

import { FLASHCARDS_PLACES } from "@/features/flashcards/data/intelligence-places";
import { RESEARCH_PLACES } from "@/features/research/components/intelligence/places";
import type { FeaturePlaces } from "./types";

export const DECLARED_FEATURES: readonly FeaturePlaces[] = [
  FLASHCARDS_PLACES,
  RESEARCH_PLACES,
];

export function declaredPlacesFor(feature: string): FeaturePlaces | null {
  return DECLARED_FEATURES.find((entry) => entry.feature === feature) ?? null;
}

/** The key prefixes a feature's page covers — its own, plus any it declares. */
export function featurePrefixes(feature: string): readonly string[] {
  const declared = declaredPlacesFor(feature);
  return [feature, ...(declared?.extraPrefixes ?? [])];
}

/** The feature whose page shows this key (an extra prefix maps to its owner). */
export function featureForKey(mandateKey: string): string {
  const prefix = mandateKey.split(".")[0] ?? mandateKey;
  const owner = DECLARED_FEATURES.find((entry) => entry.extraPrefixes?.includes(prefix));
  return owner?.feature ?? prefix;
}
