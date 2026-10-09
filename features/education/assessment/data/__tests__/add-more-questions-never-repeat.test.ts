// "Make me more questions the night before the exam": a top-up must never
// repeat what the assessment already asks, must honour the types the person
// picked, and must stamp every question it adds with the run that made it
// (so Undo and coverage can find exactly them).
import { BATCH_KEY, OUTLINE_SECTION_KEY } from "@/features/education/kits/outline/types";
import { keepNewQuestions, stampQuestion } from "../newQuestions";
import { generateQuestionsFromSources, singleSectionOf } from "../generateQuestionsFromSources";
import type { NewAssessmentItemInput } from "../types";

jest.mock("@/features/flashcards/data/generateDeckFromSources", () => ({
  chunkOwners: () => new Map(),
  groundCitations: (trust: unknown) => trust,
}));
jest.mock("@/features/education/convert/segmentedGenerate", () => {
  const actual = jest.requireActual("@/features/education/convert/segmentedGenerate");
  return {
    ...actual,
    // Runs ONLY the caller's extract on a canned agent answer, like one section.
    segmentedGenerate: jest.fn(async (args: { extract: (v: unknown, s: unknown) => unknown[] }) => {
      const items = args.extract(
        { title: "t", questions: (globalThis as { __canned?: unknown[] }).__canned ?? [] },
        {},
      );
      return {
        items,
        plan: { segments: [{}], singlePass: true },
        conversationId: null,
        firstValue: null,
        gapNote: null,
        missedCount: 0,
        groupOf: () => 0,
      };
    }),
  };
});

const q = (prompt: string, answer: string, type: NewAssessmentItemInput["questionType"] = "true_false"): NewAssessmentItemInput => ({
  questionType: type,
  prompt,
  correctAnswer: answer,
  options: type === "true_false" ? ["True", "False"] : null,
});

const EXISTING = [
  { prompt: "Water boils at 100 degrees Celsius at sea level.", correctAnswer: "True" },
  { prompt: "What organelle makes ATP?", correctAnswer: "Mitochondria" },
];

describe("keepNewQuestions", () => {
  it("drops an exact repeat, however it is punctuated or cased", () => {
    const kept = keepNewQuestions([q("water boils at 100 DEGREES celsius at sea level", "True")], EXISTING);
    expect(kept).toHaveLength(0);
  });

  it("drops a near duplicate (same idea, reworded)", () => {
    const kept = keepNewQuestions(
      [q("Which organelle makes the cell's ATP?", "Mitochondria", "short_answer")],
      EXISTING,
    );
    expect(kept).toHaveLength(0);
  });

  it("keeps a genuinely new question", () => {
    const fresh = q("Ribosomes assemble proteins from amino acids.", "True");
    expect(keepNewQuestions([fresh], EXISTING)).toEqual([fresh]);
  });

  it("keeps only the requested types; none requested means any", () => {
    const tf = q("Ribosomes assemble proteins from amino acids.", "True");
    const sa = q("Name the sugar in DNA.", "Deoxyribose", "short_answer");
    expect(keepNewQuestions([tf, sa], EXISTING, ["true_false"])).toEqual([tf]);
    expect(keepNewQuestions([tf, sa], EXISTING, [])).toEqual([tf, sa]);
  });
});

describe("stampQuestion", () => {
  it("carries the batch id and leaves other metadata alone", () => {
    const out = stampQuestion({ ...q("A?", "True"), metadata: { keep: 1 } }, { batchId: "b1" });
    expect(out.metadata).toEqual({ keep: 1, [BATCH_KEY]: "b1" });
    expect(out.topic).toBeUndefined();
  });

  it("carries the section id and title for a one-section run", () => {
    const out = stampQuestion(q("A?", "True"), { batchId: "b1", section: { id: "sec-9", title: "Cell energy" } });
    expect(out.metadata).toEqual({ [BATCH_KEY]: "b1", [OUTLINE_SECTION_KEY]: "sec-9" });
    expect(out.topic).toBe("Cell energy");
  });
});

describe("singleSectionOf", () => {
  it("names a section only when exactly one with an id is aimed at", () => {
    const one = { id: "s1", title: "One", facts: [] };
    expect(singleSectionOf({ sections: [one] })).toEqual({ id: "s1", title: "One" });
    expect(singleSectionOf({ sections: [one, { id: "s2", title: "Two", facts: [] }] })).toBeUndefined();
    expect(singleSectionOf({ sections: [{ title: "No id", facts: [] }] })).toBeUndefined();
    expect(singleSectionOf(undefined)).toBeUndefined();
  });
});

describe("generateQuestionsFromSources", () => {
  const resolved = {
    __kind: "resolved_source_set",
    sources: [
      {
        ref: { resource_type: "file", resource_id: "f1" },
        label: "Cell biology",
        form_used: "text",
        text: "### Chunk c1\nMitochondria make ATP.",
        segments: [],
        state: "ready",
        truncated: false,
        notes: [],
      },
    ],
    dropped: [],
    total_chars: 30,
  } as never;
  const ctx = { dispatch: jest.fn(), store: {} } as never;

  it("returns only new, requested-type questions, all stamped with the batch", async () => {
    (globalThis as { __canned?: unknown[] }).__canned = [
      { question_type: "true_false", prompt: "Water boils at 100 degrees Celsius at sea level.", correct_answer: "True" },
      { question_type: "multiple_choice", prompt: "Where is DNA stored?", options: ["Nucleus", "Ribosome"], correct_answer: "Nucleus" },
      { question_type: "true_false", prompt: "Ribosomes assemble proteins from amino acids.", correct_answer: "True" },
      { question_type: "true_false", prompt: "The nucleus holds the cell's DNA.", correct_answer: "True" },
    ];
    const out = await generateQuestionsFromSources({
      resolved,
      count: 3,
      difficulty: "Medium",
      depth: "applied",
      title: "Cells",
      steer: { questionTypes: ["true_false"] },
      existing: EXISTING,
      batchId: "run-1",
      ctx,
    });
    expect(out.questions.map((x) => x.prompt)).toEqual([
      "Ribosomes assemble proteins from amino acids.",
      "The nucleus holds the cell's DNA.",
    ]);
    expect(out.questions.every((x) => x.questionType === "true_false")).toBe(true);
    expect(out.questions.every((x) => x.metadata?.[BATCH_KEY] === "run-1")).toBe(true);
  });
});
