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
 * Now: the person's own first sentence when it fits, otherwise as much of it as
 * fits cut at a word boundary, and an ellipsis whenever anything was dropped.
 */
export const VISION_TITLE_MAX_LENGTH = 72;

export function titleFromVision(vision: string): string {
  const text = vision.replace(/\s+/g, " ").trim();
  if (!text) return "Untitled interview";

  // The first sentence is what a person would call it.
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  const firstSentence =
    sentenceEnd === -1 ? text : text.slice(0, sentenceEnd + 1);
  const candidate = firstSentence.trim() || text;
  // Anything left after that sentence — its own terminator does not count.
  const droppedSomething = text.slice(candidate.length).trim().length > 0;

  if (candidate.length <= VISION_TITLE_MAX_LENGTH) {
    return droppedSomething
      ? `${candidate.replace(/[.!?]+$/, "")}…`
      : candidate;
  }

  const clipped = candidate.slice(0, VISION_TITLE_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  const atWord = lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped;
  return `${atWord.replace(/[,;:\s]+$/, "")}…`;
}
