// A layout fault: a choice question's options shrink to their words (the 2026-10-02 verifier finding —
// pills sized to text instead of full-width rows), so each is far narrower than the column. F01 and
// F02 must go RED on the choice options while every text box still fills the column.
export default {
  id: "forms-choice-options-shrink",
  check: "forms.walk-public-form",
  items: ["F01", "F02"],
  description: "a style shrinks every choice option on the public form to 120 px in the test browser",
  mode: "intercept",
  rules: [],
  css: "main [data-records-choice-answer] { width: 120px !important; max-width: 120px !important; }",
};
