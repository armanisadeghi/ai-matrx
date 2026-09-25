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

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("creates a SYSTEM agent on a system-homed default", () => {
    expect(
      holderDraftOwnerOf({
        rung: "system",
        organizationId: null,
        systemHomed: true,
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

/**
 * ── THE BRIEF AND THE DECLARATION CANNOT DRIFT ───────────────────────────────
 *
 * The module header claims the two stay in step. A hand-written list of
 * expected keys does not enforce that — so this reads aidream's declaration
 * itself and diffs it both ways.
 *
 * RED as first written: the declaration offered `input_kind`, which
 * `mandate.definition` has no column for, so this side could never send it —
 * a value promised to the Holder that would never arrive.
 *
 * The declaration lives in the sibling aidream checkout. When it is not
 * present the test SKIPS OUT LOUD rather than passing quietly: a guard that
 * silently measures nothing is the thing it is guarding against.
 */
describe("the brief matches the declared provision", () => {
  const DECLARATION = join(
    __dirname,
    "../../../../aidream/aidream/services/mandates/holder_draft_mandates.py",
  );

  function declaredOfferedNames(): string[] | null {
    let source: string;
    try {
      source = readFileSync(DECLARATION, "utf8");
    } catch {
      return null;
    }
    // Only the values block — the mandate's own `required_output_keys` below
    // it are not offered values.
    const block = source.slice(
      source.indexOf("values=["),
      source.indexOf("MANDATE_HOLDER_DRAFT_MANDATE"),
    );
    return [...block.matchAll(/offered\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  }

  const declared = declaredOfferedNames();

  it("reaches aidream's declaration (a guard that measures nothing is not a guard)", () => {
    if (declared === null) {
      throw new Error(
        `Cannot read ${DECLARATION} — the sibling aidream checkout is missing, ` +
          "so this guard is UNMEASURED, which is not a pass.",
      );
    }
    expect(declared.length).toBeGreaterThan(5);
  });

  it("sends no key the provision does not declare", () => {
    if (declared === null) return;
    const brief = buildHolderDraftBrief({
      data: workspaceData(),
      offeredValues: [offered("description")],
      holder: { ...NO_HOLDER, agentId: "agent-1" },
      owner: { kind: "system" },
    });
    expect(
      Object.keys(brief).filter((key) => !declared.includes(key)),
    ).toEqual([]);
  });

  it("declares no value this side can never fill", () => {
    if (declared === null) return;
    // The richest possible brief — every optional value present. Anything
    // declared and still absent here is undeliverable by construction.
    const brief = buildHolderDraftBrief({
      data: workspaceData({ description: "A one-line description." }),
      offeredValues: [offered("description")],
      holder: { ...NO_HOLDER, agentId: "agent-1" },
      owner: { kind: "system" },
    });
    const pinned = { ...brief, pins: { model: "x" } };
    expect(declared.filter((name) => !(name in pinned))).toEqual([]);
  });
});
