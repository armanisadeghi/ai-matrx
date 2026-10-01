// A choice column bound to a list stops offering the list's words: the doors that answer "the choices of this
// column / this list" return an empty answer to the test browser. Nothing on any server changes.
export default {
  id: "lists-binding-intercept",
  check: "lists.walk-lists",
  items: ["L02"],
  description: "the choice doors (field_options, choice_options) answer no rows to the test browser",
  mode: "intercept",
  rules: [
    { match: "/rest/v1/rpc/field_options(\\?|$)", action: "drop", keep: 0 },
    { match: "/rest/v1/rpc/choice_options(\\?|$)", action: "drop", keep: 0 },
    { match: "/rest/v1/rpc/choice_field_map(\\?|$)", action: "drop", keep: 0 },
  ],
};
