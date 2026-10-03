/**
 * The questionnaire's Submit stages its answers as question/answer pairs — the
 * stored form shapes (checkbox/dropdown "Selected"/"Not Selected" maps, an
 * Other text, sliders, toggles) become the words the person picked; unanswered
 * questions are left out. Use case: a clinic intake questionnaire.
 */
import { answerText, questionnaireAnswers } from "../questionnaire-answers";

test("each stored shape reads as the person's answer", () => {
  expect(answerText({ Mornings: "Selected", Evenings: "Not Selected", Other: "Not Selected" })).toBe("Mornings");
  expect(answerText({ Mornings: "Selected", Other: "Weekends only" })).toBe("Mornings, Other: Weekends only");
  expect(answerText({ Mornings: "Not Selected", Other: "Not Selected" })).toBeNull();
  expect(answerText(7)).toBe("7");
  expect(answerText(true)).toBe("Yes");
  expect(answerText("  ")).toBeNull();
});

test("pairs come in question order, cleaned, unanswered left out", () => {
  const answers = questionnaireAnswers(["Q1: Preferred visit time", "Q2: Pain level", "Q3: Anything else?"], {
    "Q1: Preferred visit time": { Mornings: "Selected", Other: "Not Selected" },
    "Q2: Pain level": 4,
    "Q3: Anything else?": "",
  });
  expect(answers).toEqual([
    { question: "Preferred visit time", answer: "Mornings" },
    { question: "Pain level", answer: "4" },
  ]);
});
