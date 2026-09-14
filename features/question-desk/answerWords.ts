// features/question-desk/answerWords.ts
//
// THE ONE PREDICATE FOR "HAS WORDS", used by every path that can write an
// answer on this surface.
//
// 🚨 THE CLASS THIS CLOSES (V2 finding 2, 2026-09-14). Three save paths asked
// `value.length === 0` — the write box (`InterviewClient.saveOwnWords`), the
// review triage's overturn box (`ReviewTriage.sendBack`) and the ask table's
// inline box. Three spaces is not length 0, so a decision was overturned with
// nothing at all: `answer_text` hex `202020`, `status = delivered`, and the
// server's follow-through then refiled a question whose `ruled_before` read
// "You overturned it and said, verbatim:    ". The database's
// `decision_question_answer_words_ck` asked `length(answer_text) > 0` and
// caught nothing either (amended in `qd_005`, which now requires a
// non-whitespace character, so this predicate and Postgres agree).
//
// A value HAS WORDS when it contains at least one character that is not
// whitespace. That is the whole rule, and it is the ONLY question asked
// anywhere on this surface about whether an answer may be saved.
//
// 🚨 THIS PREDICATE NEVER TOUCHES THE VALUE THAT IS STORED. `answer_text` is
// written EXACTLY as it was typed or dictated — leading spaces, trailing
// newlines, blank lines and all (proven live: `202020…0a`). Trimming here to
// decide, and storing untrimmed, is deliberate: the check is about whether he
// said anything, never about tidying what he said.

/** True when `value` carries at least one non-whitespace character. */
export function hasWords(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  // `\s` in JS covers spaces, tabs, newlines, form feeds, NBSP and the
  // Unicode space separators — exactly "whitespace" as a person means it.
  return /\S/.test(value);
}

/** What the screen says when a save is refused for having no words. */
export const NO_WORDS_MESSAGE =
  "Write something first, or use one of the buttons.";

/** The same refusal, in the review triage, where Y is the other door. */
export const NO_WORDS_OVERTURN_MESSAGE =
  "Write what should happen instead, or press Y to confirm.";
