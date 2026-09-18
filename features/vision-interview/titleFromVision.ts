import {
  nameFromSentence,
  NAME_FROM_SENTENCE_MAX_LENGTH,
} from "@/lib/text/nameFromSentence";

/**
 * The name a Vision Interview carries when the person did not type one.
 *
 * Until 2026-09-16 this was `vision.split(/\s+/).slice(0, 7).join(" ")` with an
 * ellipsis only past 60 characters — which the seven-word cut can never reach.
 * So the list read, nine rows deep:
 *
 *   I want a simple assistant that tells
 *   I want a simple assistant that tells
 *   I want a simple assistant that tells
 *
 * Every one of them stopped mid-sentence with nothing saying it had been cut,
 * and none of them said what the interview was about — the distinguishing words
 * are always the ones after "I want a simple assistant that".
 *
 * The rules that fixed it are not this feature's rules: the Rulebook header and
 * the rule-saving path had the identical bug. They live once, in
 * `lib/text/nameFromSentence.ts`; this is the Vision Interview's wording of the
 * empty case.
 */
export const VISION_TITLE_MAX_LENGTH = NAME_FROM_SENTENCE_MAX_LENGTH;

export function titleFromVision(vision: string): string {
  return nameFromSentence(vision, { fallback: "Untitled interview" });
}
