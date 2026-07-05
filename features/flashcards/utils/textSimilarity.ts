// features/flashcards/utils/textSimilarity.ts
//
// Phase 1B (Write mode) — grades a typed recall answer against the card's
// back text using normalized Levenshtein similarity (no dependency: the
// algorithm is ~20 lines and this is the only caller). Deliberately forgiving
// of case, punctuation, and whitespace so "the mitochondria" vs "Mitochondria."
// grades correct — Write mode tests recall, not exact string matching.

/** 0 (completely different) .. 1 (identical) after normalization. */
export function textSimilarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;

  const distance = levenshteinDistance(x, y);
  const maxLen = Math.max(x.length, y.length);
  return 1 - distance / maxLen;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]]/g, "")
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );

  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return d[rows - 1][cols - 1];
}

export type TypedGrade = "correct" | "partial" | "incorrect";

/** Similarity ≥ 0.92 → correct (typo-tolerant); ≥ 0.6 → partial (right idea,
 *  wrong wording); below that → incorrect. Thresholds tuned for short
 *  flashcard-style answers, not long-form prose. */
export function gradeTypedAnswer(
  userAnswer: string,
  correctAnswer: string,
): TypedGrade {
  const score = textSimilarity(userAnswer, correctAnswer);
  if (score >= 0.92) return "correct";
  if (score >= 0.6) return "partial";
  return "incorrect";
}
