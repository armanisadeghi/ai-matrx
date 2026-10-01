// The organization the switch goes to drops out of the person's list (its name arrives altered in every
// database answer, in the test browser only). P02 must go RED: the switcher can no longer reach it.
export default {
  id: "plat-org-missing",
  check: "platform.walk-platform",
  items: ["P02"],
  description: "every /rest/v1/ answer has \"Harbor Dental Group\" rewritten, so the switch target is missing",
  mode: "intercept",
  rules: [{ match: "/rest/v1/", action: "rewrite", from: "Harbor Dental Group", to: "Harbor Dental Grou" }],
};
