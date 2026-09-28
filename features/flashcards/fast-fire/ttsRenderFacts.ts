// features/flashcards/fast-fire/ttsRenderFacts.ts
//
// The `flashcards.tts_render` offered values a TTS launch holds as REAL facts,
// sent by name alongside the five speech variables it already sends. All of
// them are mapped-only offers on the mandate door (declared `mapped_offer` in
// aidream client_mandates.py): the default pin drops them, so a current Holder
// receives exactly what it did before; a binding's consumption map can pick
// them up. An absent fact is OMITTED — never "" or null.

import type { FlashcardsTtsRenderOffer } from "@/types/python-generated/provision-offers";

export interface TtsRenderFactsInput {
  renderLane: "spoken_front" | "helper";
  cardId: string;
  cardFront?: string | null;
  cardBack?: string | null;
  cardTopic?: string | null;
  /** Only when the card's real position in a set run is known. */
  position?: { index: number; total: number } | null;
  setId?: string | null;
  setName?: string | null;
  energyCue?: string | null;
  leadInPhrase?: string | null;
  anticipationCue?: string | null;
  helperText?: string | null;
}

function present(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function ttsRenderFacts(
  input: TtsRenderFactsInput,
): Partial<FlashcardsTtsRenderOffer> {
  const out: Partial<FlashcardsTtsRenderOffer> = {
    render_lane: input.renderLane,
    card_id: input.cardId,
  };
  if (present(input.cardFront)) out.card_front = input.cardFront;
  if (present(input.cardBack)) out.card_back = input.cardBack;
  if (present(input.cardTopic)) out.card_topic = input.cardTopic;
  if (input.position) {
    out.card_index = input.position.index;
    out.card_total = input.position.total;
  }
  if (present(input.setId)) out.set_id = input.setId;
  if (present(input.setName)) out.set_name = input.setName;
  if (present(input.energyCue)) out.energy_cue = input.energyCue;
  if (present(input.leadInPhrase)) out.lead_in_phrase = input.leadInPhrase;
  if (present(input.anticipationCue))
    out.anticipation_cue = input.anticipationCue;
  if (present(input.helperText)) out.helper_text = input.helperText;
  return out;
}
