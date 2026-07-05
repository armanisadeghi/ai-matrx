// features/flashcards/data/podcastOverview.ts
//
// Phase 7 (Flashcards Competitive Parity Push) — turns a flashcard set into
// the podcast generator's request shape. Lives in flashcards (not
// features/podcasts) because the dependency runs one way: flashcards is a
// consumer of the generic content→audio pipeline, the pipeline knows nothing
// about fc_set/fc_card. There is no structured Q&A input on
// `PodcastGenerateRequest` today — every text path collapses to one string,
// so the deck is serialized to markdown and sent as `full_content` (verbatim
// — the pipeline should narrate exactly these cards, not go research the
// topic further).

import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";
import type { FcSetRow, CardWithDetails } from "./types";

const MAX_CARDS_IN_OVERVIEW = 60;

/**
 * Build the podcast request for a set's "audio overview" — an audio-only
 * (no images/video) run so it stays fast and cheap for a per-set action
 * button. Truncates past `MAX_CARDS_IN_OVERVIEW` so a huge deck doesn't blow
 * the script agent's context; the truncation is surfaced in the returned
 * `truncated` flag so the caller can tell the user.
 */
export function buildDeckOverviewRequest(
  set: FcSetRow,
  cards: CardWithDetails[],
): { request: PodcastGenerateRequest; truncated: boolean } {
  const truncated = cards.length > MAX_CARDS_IN_OVERVIEW;
  const included = truncated ? cards.slice(0, MAX_CARDS_IN_OVERVIEW) : cards;

  const header = [
    `# Flashcard set: ${set.name}`,
    set.topic ? `Topic: ${set.topic}` : null,
    set.description ? set.description : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = included
    .map((card, i) => {
      const helper = card.details.find((d) => d.kind === "helper")?.text;
      const example = card.details.find((d) => d.kind === "example")?.text;
      const lines = [`## Card ${i + 1}`, `Q: ${card.front}`, `A: ${card.back}`];
      if (helper) lines.push(`Hint: ${helper}`);
      if (example) lines.push(`Example: ${example}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const input_data = `${header}\n\n${body}`;

  return {
    request: {
      input_data_type: "full_content",
      input_data,
      podcast_type: "educational",
      format: "educational",
      host_count: 2,
      max_images: 0,
      max_videos: 0,
      tts_quality: "high_quality",
      prep_user_message:
        "This is a flashcard study deck. Narrate it as a conversational review session that walks through the terms and their meanings, quizzing the listener lightly and explaining anything non-obvious — don't just read the Q/A pairs verbatim.",
    },
    truncated,
  };
}
