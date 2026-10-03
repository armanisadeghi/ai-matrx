// A layout fault: the public form's column shrinks to its content (the 2026-10-02 defect — `mx-auto`
// in a flex column without `w-full`), so an answer box is far narrower than the column. F01 and F02 must go RED.
export default {
  id: "forms-answer-box-shrinks",
  check: "forms.walk-public-form",
  items: ["F01", "F02"],
  description: "a style shrinks every answer box on the public form to 160 px in the test browser",
  mode: "intercept",
  rules: [],
  css: "main input:not([type=hidden]):not([tabindex='-1']), main textarea { width: 160px !important; max-width: 160px !important; }",
};
