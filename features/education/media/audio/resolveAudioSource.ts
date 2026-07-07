// features/education/media/audio/resolveAudioSource.ts
//
// Resolves an audio-study SOURCE (a deck or a free-text topic) into the three
// things the generator + artifact page need: the material `content` to narrate,
// the `TrustEnvelope` (P0 — what the audio is grounded in), and, when adaptive,
// a `weakAreaNote` targeting the listener's weakest concepts (read from the FSRS
// study spine — the adaptivity NotebookLM structurally can't do).

"use client";

import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type { TrustEnvelope } from "@/features/education/trust/types";
import type { EduMediaSource } from "../types";
import { serializeDeck } from "./audioBrief";

export interface ResolvedAudioSource {
  content: string;
  source: EduMediaSource;
  trust: TrustEnvelope;
  weakAreaNote: string | null;
  truncated: boolean;
}

export interface ResolveResult {
  data: ResolvedAudioSource | null;
  error: string | null;
}

/** Build the "spend extra time on these" note from the deck's weakest cards. */
async function computeWeakAreaNote(
  deckCardIds: string[],
  frontById: Map<string, string>,
): Promise<string | null> {
  const res = await studyService.listWeakest("fc_card");
  if (res.error || !res.data?.length) return null;
  const deckSet = new Set(deckCardIds);
  const weakFronts = res.data
    .filter((m) => m.item_id && deckSet.has(m.item_id))
    .map((m) => frontById.get(m.item_id as string))
    .filter((f): f is string => Boolean(f))
    .slice(0, 8)
    .map((f) => f.replace(/\s+/g, " ").trim().slice(0, 80));
  if (weakFronts.length === 0) return null;
  return weakFronts.join("; ");
}

export async function resolveDeckAudioSource(
  setId: string,
  opts: { adaptive: boolean },
): Promise<ResolveResult> {
  const res = await fcService.getSetWithCards(setId);
  if (res.error || !res.data) {
    return { data: null, error: res.error ?? "Deck not found" };
  }
  const { set, cards } = res.data;
  if (cards.length === 0) {
    return { data: null, error: "This deck has no cards yet" };
  }

  const { markdown, truncated } = serializeDeck(set, cards);

  let weakAreaNote: string | null = null;
  if (opts.adaptive) {
    const frontById = new Map(cards.map((c) => [c.id, c.front]));
    weakAreaNote = await computeWeakAreaNote(
      cards.map((c) => c.id),
      frontById,
    );
  }

  const trust: TrustEnvelope = {
    citations: [
      {
        sourceId: setId,
        sourceKind: "document",
        title: set.name,
      },
    ],
    confidence: "grounded",
    groundedIn: set.name,
  };

  return {
    data: {
      content: markdown,
      source: { kind: "deck", id: setId, title: set.name },
      trust,
      weakAreaNote,
      truncated,
    },
    error: null,
  };
}

export function resolveTopicAudioSource(topic: string): ResolvedAudioSource {
  const clean = topic.trim();
  return {
    content: clean,
    source: { kind: "topic", id: null, title: clean.slice(0, 120) },
    // A free-text topic is NOT grounded in the learner's own material — say so
    // honestly (P0). The audio is reasoned from general knowledge about the topic.
    trust: {
      citations: [],
      confidence: "inferred",
      groundedIn: undefined,
    },
    weakAreaNote: null,
    truncated: false,
  };
}
