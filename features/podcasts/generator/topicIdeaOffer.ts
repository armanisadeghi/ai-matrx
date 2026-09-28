// features/podcasts/generator/topicIdeaOffer.ts
//
// The generator form's real facts, offered by name to the topic-idea mandate
// (`podcast_client.topic_idea_request`, mapped-only). Absent → omitted.

import type { PcShow } from "@/features/podcasts/types";
import type { TopicIdeaOfferFacts } from "./components/TopicIdeaHelper";

export function topicIdeaOfferFacts(input: {
  show: Pick<PcShow, "title" | "description"> | null;
  format: string;
  language: string;
  hostCount: number;
  targetAudience: string;
}): TopicIdeaOfferFacts {
  const out: TopicIdeaOfferFacts = {};
  if (input.show?.title?.trim()) out.show_title = input.show.title.trim();
  if (input.show?.description?.trim())
    out.show_description = input.show.description.trim();
  if (input.format?.trim()) out.episode_format = input.format;
  if (input.language?.trim()) out.language = input.language;
  if (Number.isFinite(input.hostCount) && input.hostCount > 0)
    out.host_count = input.hostCount;
  if (input.targetAudience?.trim())
    out.target_audience = input.targetAudience.trim();
  return out;
}
