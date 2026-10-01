// A column's internal key reaches the person: every database answer in the test browser carries the
// Minutes column's label as a snake_case key ("visit_minutes"). T59 must go RED (other steps that read
// the "Minutes" header may fail with it; T59 is the deciding item).
export default {
  id: "t2-walk-key-leaks",
  check: "tables.walk-bulk",
  items: ["T59"],
  description: "the label \"Minutes\" arrives as the key \"visit_minutes\" in every /rest/v1/ answer (test browser only)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/", action: "rewrite", from: "\"Minutes\"", to: "\"visit_minutes\"" }],
};
