import type { GroundingResult } from "@/features/rag/api/grounding";

export interface ExamDeckPlan {
  key: "foundations" | "reasoning" | "practice";
  label: string;
  focus: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export const EXAM_DECK_PLANS: readonly ExamDeckPlan[] = [
  {
    key: "foundations",
    label: "Foundations & terminology",
    focus:
      "Directly stated exam concepts, official terminology, tested domains, and format facts. Prefer atomic recall.",
    difficulty: "Easy",
  },
  {
    key: "reasoning",
    label: "Reasoning & application",
    focus:
      "Relationships, distinctions, cause-and-effect, and application supported by the official source. Do not invent practice questions.",
    difficulty: "Medium",
  },
  {
    key: "practice",
    label: "Format & test-day decisions",
    focus:
      "Official timing, section structure, scoring, allowed procedures, and decisions a learner must make. Include only facts stated in the source.",
    difficulty: "Hard",
  },
] as const;

/**
 * Search the focused authoring intent first, then the exact exam name as a
 * narrow lexical-safe fallback. The Knowledge service deliberately degrades to FTS
 * when query embedding is unavailable; a long all-term query can return zero
 * in that mode even though the selected issuer corpus is healthy. The fallback
 * remains inside the exact same explicit source list, so it never widens the
 * grounding boundary.
 */
export function examGroundingQueries(
  examName: string,
  plan: ExamDeckPlan,
): readonly [string, string] {
  return [`${examName}: ${plan.label}. ${plan.focus}`, examName.trim()];
}

export function groundingReady(
  result: GroundingResult,
): { ok: true; chunkIds: string[] } | { ok: false; reason: string } {
  if (result.status === "failed") {
    return {
      ok: false,
      reason: result.error ?? "Closed-corpus retrieval failed.",
    };
  }
  if (result.status !== "retrieved" || result.passages.length === 0) {
    return {
      ok: false,
      reason: "The selected sources returned no supporting passages.",
    };
  }
  return {
    ok: true,
    chunkIds: result.passages.map((passage) => passage.chunkId),
  };
}
