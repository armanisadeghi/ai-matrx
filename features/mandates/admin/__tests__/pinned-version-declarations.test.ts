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

describe("who-may-fill: only a system-homed job needs a system Holder", () => {
  const ORG_AGENT = "0f0f0f0f-0000-4000-8000-000000000001";
  const data = {
    ...DATA,
    agentsById: {
      [ORG_AGENT]: {
        id: ORG_AGENT,
        name: "Regional Page Writer",
        version: 3,
        isArchived: false,
        agentType: "user",
        autoContextDisabled: false,
        variableNames: [],
        contextPolicyKeys: [],
      },
    },
  } as unknown as MandateConsoleData;

  it("an org-homed job held by its org's own agent is healthy", () => {
    const row = buildRow(
      mandate({
        organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
        default_holder_id: ORG_AGENT,
        default_holder_version_id: null,
      }),
      data,
    );
    expect(row.health).not.toBe("not a system agent");
  });

  it("a system-homed job held by a non-system agent is flagged", () => {
    const { SYSTEM_ORGANIZATION_ID } = jest.requireActual("@/constants/platform-orgs");
    const row = buildRow(
      mandate({
        organization_id: SYSTEM_ORGANIZATION_ID,
        default_holder_id: ORG_AGENT,
        default_holder_version_id: null,
      }),
      data,
    );
    expect(row.health).toBe("not a system agent");
  });
});
