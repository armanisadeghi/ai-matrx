import reducer, {
  initInstanceVariables,
  setUserVariableValues,
} from "../instance-variable-values.slice";
import { resolveVariablesForRequest } from "../resolve-variables-for-request";
import { variableValueToInputText } from "../../../../utils/variable-utils";

it("keeps loaded sample objects and arrays intact through variable state and request resolution", () => {
  const conversationId = "structured-sample-reuse";
  const values = {
    icp_hypotheses: {
      __kind: "hypotheses",
      icps: [{ label: "Traveler", approved: false }],
    },
    source_manifest: [
      { url: "https://example.com", spans: [1, 2], __kind: "source" },
    ],
    gate_1_decisions: { edits: null, status: "continued_pending" },
    selected_regions: ["US", "CA"],
  };
  let state = reducer(
    undefined,
    initInstanceVariables({
      conversationId,
      definitions: Object.keys(values).map((name) => ({ name, defaultValue: null })),
    }),
  );
  state = reducer(state, setUserVariableValues({ conversationId, values }));
  const entry = state.byConversationId[conversationId];
  expect(entry.userValues).toEqual(values);
  const outgoing = resolveVariablesForRequest(entry);
  expect(JSON.parse(JSON.stringify({ variables: outgoing })).variables).toEqual(
    values,
  );
  for (const value of Object.values(values)) {
    expect(JSON.parse(variableValueToInputText(value))).toEqual(value);
  }
  expect(JSON.stringify(outgoing)).not.toContain("[object Object]");
});
