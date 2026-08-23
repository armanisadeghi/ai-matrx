/**
 * `readItems` — the `quiz_item` kind the rebuilt `flashcards.make_quiz_items`
 * agent emits (fixture = the kind's canonical sample; `__kind` ignored).
 */

jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({ runHeadlessAgentJson: jest.fn(), livePosture: () => ({}) }),
);

import { readItems } from "../quiz/makeQuizItems";

const QUIZ_ITEM = {
  __kind: "quiz_item",
  question: "Which stage of photosynthesis produces the oxygen that plants release?",
  correct: "The light-dependent reactions, when water is split",
  distractors: [
    "The Calvin cycle, when carbon dioxide is fixed",
    "Cellular respiration in the mitochondria",
    "The stroma, when glucose is assembled",
  ],
  explanation: "Oxygen comes from photolysis in the light-dependent reactions.",
};

describe("readItems (quiz_item)", () => {
  it("reads the live kind payload", () => {
    expect(readItems(QUIZ_ITEM)).toEqual({
      question: QUIZ_ITEM.question,
      correct: QUIZ_ITEM.correct,
      distractors: QUIZ_ITEM.distractors,
      explanation: QUIZ_ITEM.explanation,
    });
  });

  it("requires question + correct; floors the rest; never throws", () => {
    expect(readItems({ ...QUIZ_ITEM, correct: "" })).toBeNull();
    expect(readItems({ question: "q", correct: "a", distractors: [1, "x"] })).toEqual({
      question: "q",
      correct: "a",
      distractors: ["x"],
      explanation: "",
    });
    expect(readItems(null)).toBeNull();
    expect(readItems("text")).toBeNull();
  });
});
