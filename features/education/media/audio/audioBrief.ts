// features/education/media/audio/audioBrief.ts
//
// Turns an education audio-study request (a source + a format + adaptivity) into
// the podcast generator's `PodcastGenerateRequest`. This is the ONE place that
// knows how each format (overview / debate / panel) maps onto the reused podcast
// pipeline — everything downstream is the generic podcast machinery.
//
// The audio pipeline is aidream-owned; we only shape its request. Generalizes
// flashcards' `buildDeckOverviewRequest` (Phase 7) into the multi-format,
// weak-area-adaptive education tool.

import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";
import type { CardWithDetails, FcSetRow } from "@/features/flashcards/data/types";
import type { EduAudioFormat } from "../types";

const MAX_CARDS = 80;

/** Serialize a deck (+ up to MAX_CARDS cards) to the markdown the script agent narrates. */
export function serializeDeck(
  set: Pick<FcSetRow, "name" | "topic" | "description">,
  cards: CardWithDetails[],
): { markdown: string; truncated: boolean } {
  const truncated = cards.length > MAX_CARDS;
  const included = truncated ? cards.slice(0, MAX_CARDS) : cards;

  const header = [
    `# Study deck: ${set.name}`,
    set.topic ? `Topic: ${set.topic}` : null,
    set.description || null,
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

  return { markdown: `${header}\n\n${body}`, truncated };
}

/** Per-format base framing for the script agents. */
function formatFraming(format: EduAudioFormat): {
  podFormat: string;
  theme?: string;
  defaultHosts: number;
  steer: string;
} {
  switch (format) {
    case "debate":
      return {
        podFormat: "debate",
        theme: "debate: two experts argue opposing interpretations of this material",
        defaultHosts: 2,
        steer:
          "Stage a genuine debate: give the two hosts DISTINCT, opposed positions and clearly different voices/personalities. They should challenge each other, concede good points, and surface the real tensions in the material — not politely agree. Keep it grounded in the source; do not invent facts to win a point.",
      };
    case "panel":
      return {
        podFormat: "panel",
        theme: "expert panel roundtable on this material",
        defaultHosts: 4,
        steer:
          "Run it like a produced roundtable: each host owns a distinct angle and voice, they build on and interrupt each other naturally, and a light moderator keeps it moving. Cover the material thoroughly but conversationally.",
      };
    case "overview":
    default:
      return {
        podFormat: "educational",
        defaultHosts: 2,
        steer:
          "Narrate this as a conversational study review that walks through the concepts and their meaning, quizzing the listener lightly and explaining anything non-obvious — don't just read Q/A pairs verbatim.",
      };
  }
}

export interface BuildAudioRequestParams {
  format: EduAudioFormat;
  /** 'deck' | 'note' → full_content; 'topic' → topic. */
  sourceKind: "deck" | "note" | "topic";
  /** Serialized material (deck/note markdown) OR the topic string. */
  content: string;
  hostCount?: number;
  language?: string;
  /**
   * When set, the brief tells the agent to spend extra time on these weak
   * concepts (adaptive audio — the thing a one-shot summary structurally can't
   * do). A short human-readable list of the listener's weakest items.
   */
  weakAreaNote?: string | null;
}

/**
 * Build the `PodcastGenerateRequest` for one audio-study generation. Audio-only
 * (max_images/videos = 0) so it stays fast + cheap; high-quality TTS so the
 * saved audio is durable/produced-grade.
 */
export function buildAudioRequest(
  params: BuildAudioRequestParams,
): PodcastGenerateRequest {
  const { podFormat, theme, defaultHosts, steer } = formatFraming(params.format);
  const hostCount = Math.max(1, params.hostCount ?? defaultHosts);

  const adaptive = params.weakAreaNote
    ? ` The listener has been struggling with these specific concepts — spend extra time making them click, with fresh explanations and examples: ${params.weakAreaNote}.`
    : "";

  const prep = `${steer}${adaptive}`;

  const isTopic = params.sourceKind === "topic";

  return {
    input_data_type: isTopic ? "topic" : "full_content",
    input_data: params.content,
    podcast_type: "educational",
    format: podFormat,
    theme,
    host_count: hostCount,
    language: (params.language as PodcastGenerateRequest["language"]) ?? "en-US",
    max_images: 0,
    max_videos: 0,
    tts_quality: "high_quality",
    prep_user_message: prep,
  };
}
