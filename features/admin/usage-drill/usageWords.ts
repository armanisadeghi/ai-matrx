// features/admin/usage-drill/usageWords.ts — THE WORDS FOR AN ID THE NAMES DOOR COULD NOT NAME.
//
// Every CODE ai_usage groups by (app, feature, origin, source, provider, model, manual/automated)
// reads as the definition's own words since lane DRILL-PRESETS-RETIRE: `choices` / `empty_label` in
// aidream apps/shared/records/scripts/drill-definitions/usage-choices.ts, carried by drill_describe
// and read by the one explorer (components/official/drill-explorer/dimensionWords.ts). The usage
// page's own word map (USAGE_WORDS) is gone. What stays here: the sentence for an id the names door
// (`platform.ai_usage_names`) did not name.

/** Words for an id the names door did not name (it answers every id once its v2 is applied). */
export const UNNAMED: Record<"person" | "organization" | "agent" | "session" | "request" | "feature", string> = {
  person: "A person whose name could not be read",
  organization: "An organization whose name could not be read",
  agent: "An agent whose name could not be read",
  session: "A sign-in session whose sign-in could not be read",
  request: "A request whose details could not be read",
  feature: "A feature whose name could not be read",
};
