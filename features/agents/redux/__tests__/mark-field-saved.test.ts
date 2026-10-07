import { upsertAgent } from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import type { AgentDefinition } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  agentDefinitionWithBuilderReducer as reducer,
  setAgentField,
  setAgentOutputSchema,
  markAgentFieldSaved,
  markAgentSaved,
} from "../agent-builder.slice";

const ID = "77c81ce0-4585-4ac9-91f8-ce8857c5bbfc";

function seeded() {
  let state = reducer(undefined, { type: "init" });
  state = reducer(
    state,
    upsertAgent({ id: ID, name: "Quiz maker", outputSchema: null } as unknown as AgentDefinition),
  );
  return state;
}

describe("a single-field save keeps every other staged edit dirty (feedback 222a2925)", () => {
  it("renaming via the info editor does not drop a staged Output Schema binding", () => {
    let state = seeded();
    state = reducer(
      state,
      setAgentOutputSchema({ id: ID, outputSchema: { name: "quiz_set", strict: true, schema: {} } } as never),
    );
    state = reducer(state, setAgentField({ id: ID, field: "name", value: "Quiz maker 2" }));
    expect(state.agents[ID]._dirtyFields).toBeTruthy();

    state = reducer(state, markAgentFieldSaved({ id: ID, field: "name" }));
    expect(state.agents[ID]._dirty).toBe(true); // outputSchema still staged
    expect(state.agents[ID].outputSchema).not.toBeNull();
  });

  it("the old whole-record markAgentSaved is what wiped it", () => {
    let state = seeded();
    state = reducer(
      state,
      setAgentOutputSchema({ id: ID, outputSchema: { name: "quiz_set", strict: true, schema: {} } } as never),
    );
    state = reducer(state, markAgentSaved({ id: ID }));
    expect(state.agents[ID]._dirty).toBe(false);
  });

  it("saving the only dirty field leaves the record clean", () => {
    let state = seeded();
    state = reducer(state, setAgentField({ id: ID, field: "name", value: "Quiz maker 2" }));
    state = reducer(state, markAgentFieldSaved({ id: ID, field: "name" }));
    expect(state.agents[ID]._dirty).toBe(false);
  });
});
