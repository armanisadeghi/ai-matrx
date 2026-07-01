// features/flashcards/fast-fire/spoken-front/variations.ts
//
// Spoken-front variation bank + picker (owner design, 2026-07-01). Fast Fire can
// OPTIONALLY speak each card's question aloud, generated once via the "Generate
// custom speech" agent (Google Gemini TTS, id 04f69dff-…) and CACHED as a durable
// fc_detail (kind='spoken_front') so playback is instant — no per-turn delay.
//
// The point of this bank: every question should feel a little different, like a
// live, high-energy host — never a robotic template. The spoken content is three
// parts (owner's split): a bracketed ENERGY cue + a rotating LEAD-IN phrase + a
// bracketed ANTICIPATION cue, then the dynamic question text is appended by the
// caller. The four agent STYLE variables (context / speaker / director / scene)
// also rotate. Selection is DETERMINISTIC per card (hash of the card id) so a
// re-generation is stable, but VARIED across cards so a set doesn't feel canned.
//
// These are just strings — they intentionally do NOT have to match the agent's
// preset options. Tune freely.

/** The rotating "Here's the next one." lead-in — the owner asked for the biggest
 *  bank here (20-30) since it's the actual spoken text that repeats every card. */
export const LEAD_IN_PHRASES: readonly string[] = [
  "Here's the next one.",
  "Next up.",
  "Alright, next.",
  "Okay, here we go.",
  "On to the next.",
  "Next question.",
  "Keep it rolling.",
  "Let's keep moving.",
  "Here comes another.",
  "Next one, coming at you.",
  "Ready? Next.",
  "Quick, next up.",
  "Let's go, next.",
  "And the next.",
  "Moving on.",
  "Here's another.",
  "Next challenge.",
  "Okay, next one.",
  "Stay sharp, next.",
  "Right, here's the next.",
  "Boom, next.",
  "Let's hit the next.",
  "Onward, next question.",
  "Here we go again.",
  "Next in the lineup.",
  "Fresh one, coming up.",
  "Lock in, next.",
  "Here's your next.",
];

/** Bracketed energy cue placed BEFORE the lead-in (Gemini TTS reads these as
 *  delivery direction, not spoken words). */
export const ENERGY_CUES: readonly string[] = [
  "[high energy/active]",
  "[energetic/upbeat]",
  "[fast/punchy]",
  "[excited/quick]",
  "[bright/driving]",
  "[game-show energy]",
];

/** Bracketed anticipation cue placed BEFORE the question text. */
export const ANTICIPATION_CUES: readonly string[] = [
  "[anticipation/fast]",
  "[quick/eager]",
  "[leaning in, fast]",
  "[building tension, quick]",
  "[rapid/curious]",
  "[snappy]",
];

/** Agent `sample_context` — the overall style frame (5-6, all fast/energetic). */
export const SAMPLE_CONTEXTS: readonly string[] = [
  "High-energy quiz show. Fast, punchy pacing. Tone is energetic and exciting.",
  "Rapid-fire study drill. Quick, driving pace. Tone is upbeat and motivating.",
  "Fast-paced academic decathlon. Crisp, urgent delivery. Tone is thrilling and warm.",
  "Energetic flashcard sprint. Brisk, no-dead-air pacing. Tone is encouraging and quick.",
  "Live trivia round. Fast, animated pacing. Tone is playful and high-intensity.",
  "Timed review session. Efficient, quick, and lively. Tone is confident and warm.",
];

/** Agent `speaker_profile` — who's talking (5-6, all fast, clear instructors). */
export const SPEAKER_PROFILES: readonly string[] = [
  "A high-energy, fast-paced instructor who speaks clearly but very quickly.",
  "An enthusiastic quiz-show host with rapid, crisp delivery.",
  "A motivating coach who talks fast, warm, and punchy.",
  "A sharp, quick-witted study partner who keeps a brisk pace.",
  "An animated game-show announcer, fast and exciting but always clear.",
  "A lively tutor with quick, encouraging, high-tempo delivery.",
];

/** Agent `directors_notes` — the delivery direction (5-6, all fast/energetic). */
export const DIRECTORS_NOTES: readonly string[] = [
  "Professional and clear, but fast-paced and energetic with excitement.",
  "High-energy, fast, game-show style — clear diction, no dead air.",
  "Rushed but controlled — quick tempo, bright tone, keep the momentum.",
  "Punchy and urgent, like a rapid-fire round; warm and encouraging.",
  "Brisk and exciting; lean into the anticipation, keep it moving.",
  "Fast and lively, confident and crisp, with a competitive edge.",
];

/** Agent `scene` — the setting (5-6; plain strings, not the picklist ids). */
export const SCENES: readonly string[] = [
  "A high-energy educational competition with a live studio audience.",
  "A fast-paced international academic decathlon, timer ticking.",
  "A bright quiz-show stage, spotlight on the contestant, clock running.",
  "An intense rapid-fire study sprint against the clock.",
  "A lively trivia arena with an energized crowd.",
  "A focused, upbeat timed-review room, momentum building.",
];

/** Optional openers for the FIRST card (used sparingly). */
export const FIRST_CARD_PHRASES: readonly string[] = [
  "[high energy] Let's get started!",
  "[bright/fast] Here we go — first one!",
  "[energetic] Alright, let's do this. First up!",
];

/** Optional milestone lines near the end (used sparingly — too many annoy). */
export function milestonePhrase(remaining: number): string | null {
  if (remaining === 5) return "[quick/motivating] Five to go — keep it up!";
  if (remaining === 3) return "[quick/driving] Three left — stay sharp!";
  if (remaining === 1) return "[building] Last one — finish strong!";
  return null;
}

/** Stable 32-bit hash of a string (deterministic per card id). */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], n: number): T {
  return arr[n % arr.length];
}

export interface SpokenFrontVariables {
  /** The full `content` variable: cues + lead-in + anticipation + question. */
  content: string;
  sample_context: string;
  speaker_profile: string;
  directors_notes: string;
  scene: string;
}

/**
 * Deterministically pick a full, varied spoken-front variable set for a card.
 * Same `cardId` → same selection (stable regeneration); different cards → varied.
 * `index`/`total` add optional first-card / milestone flavor.
 */
export function pickSpokenFrontVariables(
  cardId: string,
  frontText: string,
  index: number,
  total: number,
): SpokenFrontVariables {
  const h = hash(cardId);
  // Decorrelate the picks by shifting the hash per dimension.
  const energy = pick(ENERGY_CUES, h);
  const anticipation = pick(ANTICIPATION_CUES, h >> 3);
  const remaining = total - index - 1;
  const milestone = index > 0 ? milestonePhrase(remaining) : null;
  const leadIn =
    index === 0
      ? pick(FIRST_CARD_PHRASES, h >> 5)
      : (milestone ?? `${energy} ${pick(LEAD_IN_PHRASES, h >> 5)}`);

  const content = `${leadIn} ${anticipation} ${frontText}`.trim();

  return {
    content,
    sample_context: pick(SAMPLE_CONTEXTS, h >> 7),
    speaker_profile: pick(SPEAKER_PROFILES, h >> 11),
    directors_notes: pick(DIRECTORS_NOTES, h >> 13),
    scene: pick(SCENES, h >> 17),
  };
}
