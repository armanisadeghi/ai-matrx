/**
 * deep-research-offer-values.ts — the REAL facts the Deep research card holds,
 * named exactly as the `research.topic_deep_research` provision declares them
 * (aidream `services/mandates/client_mandates.py`).
 *
 * Mapped-only offers (pass_by_name=False): the mandate door drops them unless
 * a binding's consumption map names them, so sending them never changes what
 * a current Holder receives. Absent facts are omitted — never sent as "" or
 * null. The three source lists are ALIGNED by index (source i's url, title,
 * tier); a list is sent only when at least one source has that fact, and a
 * source missing it holds "" at its index so the alignment survives.
 */

import type { ResearchTopicDeepResearchOffer } from "@/types/python-generated/provision-offers";
import type { ResearchSource, ResearchTopic } from "../../types";

export type DeepResearchFacts = Partial<
  Pick<
    ResearchTopicDeepResearchOffer,
    | "topic_name"
    | "topic_description"
    | "intent_brief"
    | "tone_profile"
    | "source_urls"
    | "source_titles"
    | "source_authority_tiers"
    | "source_count"
  >
>;

const text = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

function alignedList(
  values: (string | null | undefined)[],
): string[] | undefined {
  const cleaned = values.map((value) => value?.trim() ?? "");
  return cleaned.some(Boolean) ? cleaned : undefined;
}

export function deepResearchOfferValues(
  topic: Pick<
    ResearchTopic,
    "name" | "description" | "intent_brief" | "tone_profile"
  >,
  sources:
    | Pick<ResearchSource, "url" | "title" | "authority_tier">[]
    | null,
): DeepResearchFacts {
  const facts = {
    topic_name: text(topic.name),
    topic_description: text(topic.description),
    intent_brief: text(topic.intent_brief),
    tone_profile: text(topic.tone_profile),
    source_urls: sources ? alignedList(sources.map((s) => s.url)) : undefined,
    source_titles: sources
      ? alignedList(sources.map((s) => s.title))
      : undefined,
    source_authority_tiers: sources
      ? alignedList(sources.map((s) => s.authority_tier))
      : undefined,
    source_count: sources ? sources.length : undefined,
  } satisfies DeepResearchFacts;
  const out: DeepResearchFacts = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value !== undefined) Object.assign(out, { [key]: value });
  }
  return out;
}
