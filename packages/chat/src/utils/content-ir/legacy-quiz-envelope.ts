import type { CanonicalBlockIR } from "@ai-matrx/content-ir";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Mirror the server's legacy quiz adapter while keeping source aliases in IR residue. */
export function canonicalizeCompletedLegacyQuizEnvelope(
  envelope: CanonicalBlockIR,
  sourceText: string,
): CanonicalBlockIR {
  if (envelope.root.kind !== "quiz_set" || envelope.root.status !== "complete") {
    return envelope;
  }

  let source: unknown;
  try {
    source = JSON.parse(sourceText);
  } catch {
    return envelope;
  }
  if (!isRecord(source)) return envelope;

  // A declared modern kind already owns canonical fields and can legitimately
  // contain nullable answers or future schema fields. Only the old root-key
  // vocabulary gets translated.
  const hasLegacyAliases =
    typeof source.quiz_title === "string" ||
    typeof source.quizTitle === "string" ||
    Array.isArray(source.multiple_choice) ||
    Array.isArray(source.multipleChoice);
  if (source.__kind !== undefined || !hasLegacyAliases) return envelope;

  const title =
    typeof source.quiz_title === "string"
      ? source.quiz_title
      : typeof source.quizTitle === "string"
        ? source.quizTitle
        : null;
  const sourceQuestions = source.questions ?? source.multiple_choice ?? source.multipleChoice;
  if (title === null || !Array.isArray(sourceQuestions)) return envelope;
  const questions = sourceQuestions.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    // Legacy root-key quiz questions are scalar payload records, not declared
    // nested kind instances. Python's adapter intentionally leaves their
    // source vocabulary marker-free; do the same without affecting modern
    // `quiz_set` documents (which return before this adapter runs).
    const { __kind: _legacyKind, ...legacyQuestion } = candidate;
    const options = Array.isArray(candidate.options) ? candidate.options : [];
    const answer = candidate.correct_answer ?? candidate.correctAnswer ?? "";
    const correctAnswer =
      typeof answer === "number" &&
      Number.isInteger(answer) &&
      answer >= 0 &&
      answer < options.length
        ? options[answer]
        : answer;
    return [{
      ...legacyQuestion,
      type: typeof candidate.type === "string" ? candidate.type : "multiple_choice",
      question: typeof candidate.question === "string" ? candidate.question : "",
      options,
      correct_answer:
        typeof correctAnswer === "string" ? correctAnswer : String(correctAnswer),
      explanation:
        typeof candidate.explanation === "string" ? candidate.explanation : null,
    }];
  });

  return {
    ...envelope,
    root: {
      ...envelope.root,
      value: { ...envelope.root.value, title, questions },
    },
  };
}
