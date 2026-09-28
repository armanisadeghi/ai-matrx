import { buildMemberRosterOffer } from "./roleDescriberOffer";
import type { OrchestrasState } from "@/features/agents/redux/orchestras/slice";

const member = { agentId: "a1" } as OrchestrasState["byId"][string]["members"][number];

describe("buildMemberRosterOffer", () => {
  it("reads the loaded Orchestra with native types", () => {
    const state = {
      byId: {
        c1: {
          members: [member, member],
          config: { tagline: "Draft, grade, ship", mode: "sequential", depthBudget: 1 },
          label: "Blog pipeline",
          exists: true,
          status: "ready",
          error: null,
        },
      },
      list: [],
    } as unknown as Pick<OrchestrasState, "byId" | "list">;
    expect(buildMemberRosterOffer(state, "c1")).toEqual({
      conductor_id: "c1",
      orchestra_label: "Blog pipeline",
      orchestra_mode: "sequential",
      orchestra_tagline: "Draft, grade, ship",
      depth_budget: 1,
      member_count: 2,
    });
  });

  it("never fills an unset mode or depth budget with a default", () => {
    const state = {
      byId: { c1: { members: [], config: {}, label: null, exists: true, status: "ready", error: null } },
      list: [{ conductorId: "c1", name: "Conductor", label: null, config: {} }],
    } as unknown as Pick<OrchestrasState, "byId" | "list">;
    expect(buildMemberRosterOffer(state, "c1")).toEqual({
      conductor_id: "c1",
      orchestra_label: "Conductor",
      member_count: 0,
    });
  });
});
