// features/flashcards/fast-fire/session-transcript.ts
//
// The FULL-SESSION transcript (FastFire spec 26c / Q15 #3): everything the
// learner said, segmented per card IN DRILL ORDER with each card's question
// and resolved grade — so the end-of-session "professor" review sees the
// SESSION, not a bag of grades: confusion between related cards, consistency,
// and in-session improvement all live in the sequence. The serialized text is
// what the review mandate receives as `transcript` and what persists to
// `study_session.session_transcript` (a plain text column).

import type { GradeResult } from "@/features/education/trust/types";
import type { CardGrade, DrillCard } from "./redux/fastFireSlice";

export interface TranscriptSegment {
  /** 1-based position in the order the drill actually presented the card. */
  position: number;
  cardId: string;
  front: string;
  result: GradeResult | null;
  score: number | null;
  /** What the learner said on this card ("" when nothing was transcribed). */
  transcript: string;
}

/** Keep the serialized transcript bounded — a long drill stays reviewable. */
const MAX_TRANSCRIPT_CHARS = 20_000;

function segmentLine(s: TranscriptSegment): string {
  const grade =
    s.result != null
      ? ` (${s.result}${s.score != null ? `, ${s.score.toFixed(2)}` : ""})`
      : " (ungraded)";
  const answer = s.transcript.trim() || "—";
  return `[${s.position}] Q: ${s.front}${grade}\nA: ${answer}`;
}

/**
 * Assemble the session transcript from the drill's own state. Pure — cards in
 * presented order, grades keyed by card id (missing grade = ungraded segment).
 */
export function buildSessionTranscript(
  cards: DrillCard[],
  gradeByCard: ReadonlyMap<string, CardGrade>,
): { segments: TranscriptSegment[]; text: string } {
  const segments: TranscriptSegment[] = cards.map((c, i) => {
    const g = gradeByCard.get(c.id);
    return {
      position: i + 1,
      cardId: c.id,
      front: c.front,
      result: g?.result ?? null,
      score: g?.score ?? null,
      transcript: g?.transcript ?? "",
    };
  });
  let text = segments.map(segmentLine).join("\n\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = `${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n[transcript truncated]`;
  }
  return { segments, text };
}
