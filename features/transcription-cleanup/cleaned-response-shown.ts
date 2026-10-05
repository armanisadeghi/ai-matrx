import { answerFieldText } from "@/components/official/structured-value/AnswerTextPreview";

/**
 * What the cleaned-transcript field SHOWS: the person's edit if there is one,
 * else the agent's answer — a kind answer as its readable markdown (a kind
 * still arriving as its loader word), never `{"__kind":…}` JSON. DISPLAY ONLY:
 * the answer text the pad persists and applies stays the data (`__kind` kept).
 */
export function cleanedResponseShown(
  edited: string | null,
  answerText: string,
  busy: boolean,
): string {
  return edited ?? answerFieldText(answerText, busy);
}
