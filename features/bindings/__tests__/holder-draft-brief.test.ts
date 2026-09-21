/**
 * ── THE "+ AGENT" BRIEF AND ITS OWNER RULE ───────────────────────────────────
 *
 * Two things this pins, both of which were wrong the moment they were written
 * by hand instead of derived:
 *
 *  (a) THE OWNER FOLLOWS THE RUNG, never the page. A system rung's agent is a
 *      SYSTEM agent — if it were the person's, the holder picker's own list
 *      would refuse the agent the door just created, and the server's
 *      containment check would 409 on Save. An organization's rung with no
 *      organization named yet has NO owner, so the door refuses out loud.
 *  (b) THE BRIEF NAMES ONLY WHAT THE PROVISION DECLARES, and omits an optional
 *      value it does not have rather than sending an empty string that reads to
 *      the agent as "the answer is nothing".
 */

import {
  buildHolderDraftBrief,
  holderDraftOwnerOf,
} from "../holder-draft-brief";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import type { OfferedValue } from "@/features/mandates/provision-shapes";
import type { HolderDraft } from "../ScopeHolderBar";

const NO_HOLDER: HolderDraft = {
  kind: "agent",
  agentId: null,
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
};

const offered = (name: string): OfferedValue => ({
  name,
  kind: "text",
  guaranteed: true,
  lazy: false,
  description: `the ${name}`,
  example: "",
});

function workspaceData(
  overrides: Partial<MandateWorkspaceData["mandate"]> = {},
): MandateWorkspaceData {
  return {
    mandate: {
      id: "m1",
      mandate_key: "feedback.item_triage_decision",
      label: "Feedback Item Triage Decision",
      goal: "Decide three narrow things about one feedback item.",
      description: null,
      output_kind: "json",
      accepts_user_input: false,
      organization_id: "org-1",
      ...overrides,
    } as MandateWorkspaceData["mandate"],
    contract: {
      requiredVariables: [],
      requiredContextPolicyKeys: [],
      requiredOutputKeys: ["is_defect", "owning_surface", "urgency"],
      spillVariables: [],
    },
    provisionKey: "feedback.item_triage",
    pins: {},
    pinnedContext: [],
    offer: null,
    bindings: [],
    agentsById: { "agent-1": { name: "Triage Clerk" } as never },
    versionsById: {},
  } as unknown as MandateWorkspaceData;
}

describe("whose agent the + Agent door creates", () => {
  it("creates a SYSTEM agent on the platform-wide rung", () => {
    expect(
      holderDraftOwnerOf({
        rung: "global",
        organizationId: null,
        systemHomed: false,
      }),
    ).toEqual({ kind: "system" });
  });

  it("creates a SYSTEM agent on a system-homed job's own default", () => {
    expect(
      holderDraftOwnerOf({
        rung: "system",
        organizationId: null,
        systemHomed: true,
      }),
    ).toEqual({ kind: "system" });
  });

  it("creates an ORGANIZATION's agent on an org-homed job's own default", () => {
    expect(
      holderDraftOwnerOf({
        rung: "system",
        organizationId: "org-7",
        systemHomed: false,
      }),
    ).toEqual({ kind: "organization", organizationId: "org-7" });
  });

  it("refuses — no owner — when the org rung names no organization", () => {
    expect(
      holderDraftOwnerOf({
        rung: "org",
        organizationId: null,
        systemHomed: false,
      }),
    ).toBeNull();
  });

  it("creates the person's own agent on their rung", () => {
    expect(
      holderDraftOwnerOf({
        rung: "user",
        organizationId: null,
        systemHomed: false,
      }),
    ).toEqual({ kind: "user" });
  });
});

describe("the brief handed to the drafting job", () => {
  it("carries the job's contract and the offered values by their exact names", () => {
    const brief = buildHolderDraftBrief({
      data: workspaceData(),
      offeredValues: [offered("description"), offered("route")],
      holder: NO_HOLDER,
      owner: { kind: "system" },
    });

    expect(brief.mandate_key).toBe("feedback.item_triage_decision");
    expect(brief.feature).toBe("feedback");
    expect(brief.goal).toContain("three narrow things");
    expect(brief.output_kind).toBe("json");
    expect(brief.required_output_keys).toEqual([
      "is_defect",
      "owning_surface",
      "urgency",
    ]);
    expect(brief.owner_scope).toBe("system");
    expect(
      (brief.offered_values as { name: string }[]).map((v) => v.name),
    ).toEqual(["description", "route"]);
  });

  it("OMITS an optional value it does not have, never an empty stand-in", () => {
    const brief = buildHolderDraftBrief({
      data: workspaceData({ description: null, output_kind: null }),
      offeredValues: [],
      holder: NO_HOLDER,
      owner: { kind: "user" },
    });
    expect("description" in brief).toBe(false);
    expect("output_kind" in brief).toBe(false);
    expect("current_holder" in brief).toBe(false);
  });

  it("names what holds the job today when something does", () => {
    const brief = buildHolderDraftBrief({
      data: workspaceData(),
      offeredValues: [],
      holder: { ...NO_HOLDER, agentId: "agent-1" },
      owner: { kind: "organization", organizationId: "org-1" },
    });
    expect(brief.current_holder).toEqual({
      kind: "agent",
      name: "Triage Clerk",
      agent_id: "agent-1",
    });
    expect(brief.owner_scope).toBe("organization");
  });
});
