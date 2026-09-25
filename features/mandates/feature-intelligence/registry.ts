// features/mandates/feature-intelligence/registry.ts
//
// EVERY FEATURE WITH AN INTELLIGENCE PAGE — the declared places maps, one per
// feature, each kept true by a test that reads its call sites
// (`__tests__/declared-places.test.ts`, plus flashcards' and research's own).
// Pure data: the service, the places resolver and the /intelligence index all
// read it. Add a feature here beside its map.

import { FLASHCARDS_PLACES } from "@/features/flashcards/data/intelligence-places";
import { RESEARCH_PLACES } from "@/features/research/components/intelligence/places";
import { CHAT_PLACES } from "@/features/agents/components/chat/intelligence-places";
import { NOTES_PLACES } from "@/features/notes/intelligence-places";
import { DATA_PLACES } from "@/features/data-tables/intelligence-places";
import { SMS_PLACES } from "@/features/sms/intelligence-places";
import { WAR_ROOM_PLACES } from "@/features/war-room/intelligence-places";
import { SCRAPER_PLACES } from "@/features/scraper/intelligence-places";
import { VOICE_PLACES } from "@/features/voice-agent/intelligence-places";
import { TRANSCRIPT_STUDIO_PLACES } from "@/features/transcript-studio/intelligence-places";
import { CRM_PLACES } from "@/features/crm/intelligence-places";
import { CONTENT_PLAN_PLACES } from "@/features/marketing/content-plan/intelligence-places";
import { MARKETING_PLACES } from "@/features/marketing/intelligence-places";
import { PODCAST_PLACES } from "@/features/podcasts/intelligence-places";
import { EDUCATION_PLACES } from "@/features/education/intelligence-places";
import { MASTERWORK_PLACES } from "@/features/masterwork/intelligence-places";
import type { FeaturePlaces } from "./types";

export const DECLARED_FEATURES: readonly FeaturePlaces[] = [
  CHAT_PLACES,
  NOTES_PLACES,
  RESEARCH_PLACES,
  FLASHCARDS_PLACES,
  EDUCATION_PLACES,
  PODCAST_PLACES,
  MARKETING_PLACES,
  CONTENT_PLAN_PLACES,
  DATA_PLACES,
  CRM_PLACES,
  SMS_PLACES,
  WAR_ROOM_PLACES,
  SCRAPER_PLACES,
  VOICE_PLACES,
  TRANSCRIPT_STUDIO_PLACES,
  MASTERWORK_PLACES,
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

/** The page a feature slug lands on — an extra prefix (`seo`) opens its owner (`marketing`). */
export function canonicalFeature(feature: string): string {
  return featureForKey(`${feature}.`);
}
