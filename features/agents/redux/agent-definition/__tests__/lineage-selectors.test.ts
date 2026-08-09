/**
 * selectAgentLineageIndex — the data behind THE DOOR LAW's hardest corollary:
 * a surface that can say "this is a personal agent" must also say WHICH system
 * agent it is twinned with. The link can point either way (a personal copy of a
 * system agent, or a system agent promoted FROM a personal one), so both
 * directions are load-bearing.
 *
 * Real shape from production (2026-08-08): agent.definition row
 * "Deep Research Specialist" (builtin) carries source_agent_id =
 * "Deep Web Research Agent" (user) — i.e. the twin is a CHILD, not a parent.
 */

import { selectAgentLineageIndex } from "../selectors";
import type { RootState } from "@/lib/redux/store";
import type { AgentDefinitionRecord } from "../../../types/agent-definition.types";

function agent(
  id: string,
  name: string,
  agentType: "user" | "builtin",
  sourceAgentId: string | null,
): AgentDefinitionRecord {
  return {
    id,
    name,
    agentType,
    sourceAgentId,
    isVersion: false,
  } as unknown as AgentDefinitionRecord;
}

function stateWith(agents: AgentDefinitionRecord[]): RootState {
  return {
    agentDefinition: {
      agents: Object.fromEntries(agents.map((a) => [a.id, a])),
    },
  } as unknown as RootState;
}

const PERSONAL = "b9c9ded5";
const SYSTEM_CHILD = "11fcc4f0";
const SYSTEM_PARENT = "aaaa1111";

describe("selectAgentLineageIndex", () => {
  it("finds a system twin that is a CHILD (system agent promoted from a personal one)", () => {
    const index = selectAgentLineageIndex(
      stateWith([
        agent(PERSONAL, "Deep Web Research Agent", "user", null),
        agent(SYSTEM_CHILD, "Deep Research Specialist", "builtin", PERSONAL),
      ]),
    );

    expect(index[PERSONAL].systemTwin).toEqual({
      id: SYSTEM_CHILD,
      name: "Deep Research Specialist",
      agentType: "builtin",
      isSystem: true,
    });
    expect(index[PERSONAL].parent).toBeNull();
    expect(index[PERSONAL].children).toHaveLength(1);
  });

  it("finds a system twin that is a PARENT (personal copy of a system agent)", () => {
    const index = selectAgentLineageIndex(
      stateWith([
        agent(SYSTEM_PARENT, "Shared Writer", "builtin", null),
        agent(PERSONAL, "My Writer", "user", SYSTEM_PARENT),
      ]),
    );

    expect(index[PERSONAL].systemTwin?.id).toBe(SYSTEM_PARENT);
    expect(index[PERSONAL].parent?.id).toBe(SYSTEM_PARENT);
    // …and from the system side, the personal copy is a child with no twin.
    expect(index[SYSTEM_PARENT].children.map((c) => c.id)).toEqual([PERSONAL]);
    expect(index[SYSTEM_PARENT].systemTwin).toBeNull();
  });

  it("reports no twin when the only relative is another personal copy", () => {
    const index = selectAgentLineageIndex(
      stateWith([
        agent(PERSONAL, "Mine", "user", null),
        agent("cccc2222", "Also mine", "user", PERSONAL),
      ]),
    );

    expect(index[PERSONAL].systemTwin).toBeNull();
    expect(index[PERSONAL].children).toHaveLength(1);
  });

  it("ignores version snapshots and unresolvable parents", () => {
    const snapshot = {
      ...agent("dddd3333", "v3 snapshot", "user", PERSONAL),
      isVersion: true,
    } as AgentDefinitionRecord;

    const index = selectAgentLineageIndex(
      stateWith([agent(PERSONAL, "Mine", "user", "missing-parent"), snapshot]),
    );

    expect(index[PERSONAL].parent).toBeNull();
    expect(index[PERSONAL].children).toHaveLength(0);
    expect(index["dddd3333"]).toBeUndefined();
  });
});
