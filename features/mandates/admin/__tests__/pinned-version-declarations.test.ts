/**
 * A PINNED version answers with ITS OWN declarations (review 2026-09-25).
 *
 * `shortcut.agent_generator` pins v1 of "Agent Structure Builder", which
 * declares one variable; v16 of the live agent added a second, context-bound
 * one. The list peek read the live agent (2 inputs) while the Definition tab —
 * the server's input surface, which resolves the pin — said 1. Goes RED when
 * buildRow reads the live agent for a pinned Holder.
 */
import { buildRow } from "../mandate-health";
import type { MandateConsoleData, MandateDefinitionRow } from "../service";

const AGENT = "b29d7895-31e3-417f-83a2-00dfdd732d30";
const V1 = "944ad7e1-e4e6-4027-9d1b-bcb8744d29d0";

const DATA = {
  mandates: [],
  agentsById: {
    [AGENT]: {
      id: AGENT,
      name: "Agent Structure Builder",
      version: 16,
      isArchived: false,
      agentType: "builtin",
      autoContextDisabled: false,
      variableNames: ["prompt_purpose", "model_selection_guidance"],
      contextPolicyKeys: [],
    },
  },
  versionsById: {
    [V1]: {
      id: V1,
      agentId: AGENT,
      versionNumber: 1,
      name: "Agent Structure Builder",
      variableNames: ["prompt_purpose"],
      contextPolicyKeys: [],
    },
  },
  bindingsByMandateId: {},
} as unknown as MandateConsoleData;

function mandate(overrides: Record<string, unknown>): MandateDefinitionRow {
  return {
    id: "b255a098-e177-4014-976e-ef920d889384",
    mandate_key: "shortcut.agent_generator",
    label: "Agent generator",
    is_enabled: true,
    output_kind: null,
    metadata: null,
    updated_at: "2026-09-25T20:00:00Z",
    default_holder_type: "agent",
    default_holder_id: AGENT,
    ...overrides,
  } as unknown as MandateDefinitionRow;
}

describe("holder declarations follow the pin", () => {
  it("a pinned version shows the version's inputs, not the live agent's", () => {
    const row = buildRow(mandate({ default_holder_version_id: V1 }), DATA);
    expect(row.holderDeclarations).toEqual(["prompt_purpose"]);
  });

  it("an unpinned (latest) holder shows the live agent's inputs", () => {
    const row = buildRow(mandate({ default_holder_version_id: null }), DATA);
    expect(row.holderDeclarations).toEqual(["prompt_purpose", "model_selection_guidance"]);
  });
});
