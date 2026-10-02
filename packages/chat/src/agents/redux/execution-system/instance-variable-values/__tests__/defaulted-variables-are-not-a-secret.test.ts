/**
 * A default the person left alone is still what the server will use.
 * The first-turn strip must show it — omitting it is a lie.
 */

import reducer, {
  createInstanceFullPayloadForTest,
} from "@/features/agents/components/messages-display/user/__tests__/host-wired-values.harness";
import {
  initInstanceVariables,
  setUserVariableValues,
  stampSubmittedFirstTurnValues,
} from "../instance-variable-values.slice";
import { selectOwnSubmittedFirstTurnValues } from "../instance-variable-values.selectors";
import { resolveVariablesForRequest } from "../resolve-variables-for-request";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONVERSATION = "conv-defaults";

type State = Parameters<ReturnType<typeof selectOwnSubmittedFirstTurnValues>>[0];
const wrap = (instanceVariableValues: unknown): State =>
  ({ instanceVariableValues }) as State;

const DEFINITIONS: VariableDefinition[] = [
  { name: "topic", defaultValue: "recycling" },
  { name: "tone", defaultValue: "formal" },
];

describe("defaulted variables are not a secret", () => {
  it("resolves saved defaults the person never typed", () => {
    expect(
      resolveVariablesForRequest({
        definitions: DEFINITIONS,
        userValues: { topic: "pallets" },
        scopeValues: {},
      }),
    ).toEqual({ topic: "pallets", tone: "formal" });
  });

  it("the first-turn strip shows the default the server will apply", () => {
    let state = reducer(
      undefined,
      createInstanceFullPayloadForTest(CONVERSATION),
    );
    state = reducer(
      state,
      initInstanceVariables({
        conversationId: CONVERSATION,
        definitions: DEFINITIONS,
      }),
    );
    state = reducer(
      state,
      setUserVariableValues({
        conversationId: CONVERSATION,
        values: { topic: "pallets" },
      }),
    );
    const resolved = resolveVariablesForRequest({
      definitions: DEFINITIONS,
      userValues: state.byConversationId[CONVERSATION]?.userValues,
      scopeValues: {},
    });
    state = reducer(
      state,
      stampSubmittedFirstTurnValues({
        conversationId: CONVERSATION,
        values: resolved,
      }),
    );

    const own = selectOwnSubmittedFirstTurnValues(CONVERSATION)(wrap(state));
    expect(own).toEqual({ topic: "pallets", tone: "formal" });
    expect(buildVariableDisplayLines(own).map((line) => line.key).sort()).toEqual(
      ["tone", "topic"],
    );
  });

  it("the Builder send path freezes live agent defaults, not a stale instance snapshot", () => {
    const source = readFileSync(
      join(
        __dirname,
        "../../thunks/execute-manual-instance.thunk.ts",
      ),
      "utf8",
    );
    expect(source).toContain("resolveVariablesForRequest");
    expect(source).toContain("liveAgent?.variableDefinitions");
    expect(source).toContain("agent.variableDefinitions ?? instanceVariables?.definitions");
  });
});
