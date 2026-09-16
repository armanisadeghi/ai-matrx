// Find Usages — the ONE risk ladder and the one-phrase "what changed".
//
// Two graders feed the table; this pins how each verdict lands on Arman's
// ranking (variables / context slots = red; output shape = orange; model or
// prompt = green) and that a person reads a short phrase in the cell, never
// the server's full paragraph.

import type { AgentUsageRow } from "@/features/agents/redux/usages/usages.types";
import type { ImpactVerdict } from "@/features/mandates/admin/impact";
import { DIMENSION_ORDER } from "../dimensions";
import {
  countByDimension,
  rowFromUsage,
  rowFromVerdict,
} from "../unified-rows";

function usage(overrides: Partial<AgentUsageRow> = {}): AgentUsageRow {
  return {
    rowKind: "usage",
    usageType: "shortcut",
    usageId: "s-1",
    nodeId: null,
    label: "My shortcut",
    ownerUserId: "u-1",
    organizationId: null,
    organizationName: null,
    orgManagerUserIds: [],
    agentId: "agent-1",
    agentName: "Agent",
    currentVersion: 12,
    pinMode: "pinned",
    pinnedVersionId: "v10",
    pinnedVersionNumber: 10,
    versionsBehind: 2,
    stalePin: true,
    isUsageActive: true,
    worstSeverity: null,
    findings: [],
    config: null,
    managedByCaller: true,
    usageUpdatedAt: null,
    ...overrides,
  };
}

function verdict(overrides: Partial<ImpactVerdict> = {}): ImpactVerdict {
  return {
    holder_kind: "mandate_default",
    row_id: "row-1",
    mandate_key: "probe.alpha",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Agent",
    lineage_path: [{ agent_id: "agent-1", agent_name: "Agent", relation: "self" }],
    pinned_version_id: "v10",
    pinned_version_number: 10,
    latest_version_id: "v12",
    latest_version_number: 12,
    grade: "green",
    blocker: null,
    findings: [],
    settings_drift: { capability_checked: true, capability: [], keys: [] },
    changed_columns: [],
    apply_token: {
      holder_kind: "mandate_default",
      row_id: "row-1",
      expected_pinned_version_id: "v10",
      target_version_id: "v12",
    },
    auto_advance_eligible: false,
    ...overrides,
  } as ImpactVerdict;
}

describe("the one risk ladder", () => {
  it("maps the scan's severities onto Arman's ranking", () => {
    expect(rowFromUsage(usage({ worstSeverity: "breaking" })).risk).toBe("red");
    expect(rowFromUsage(usage({ worstSeverity: "silent_breaking" })).risk).toBe("red");
    expect(rowFromUsage(usage({ worstSeverity: "warning" })).risk).toBe("orange");
    expect(rowFromUsage(usage({ worstSeverity: "info" })).risk).toBe("green");
    expect(rowFromUsage(usage({ worstSeverity: null, stalePin: false })).risk).toBe("clean");
  });

  it("maps the impact grades onto the same ranking", () => {
    expect(rowFromVerdict(verdict({ grade: "red" }), "agent-1").risk).toBe("red");
    expect(rowFromVerdict(verdict({ grade: "orange" }), "agent-1").risk).toBe("orange");
    expect(rowFromVerdict(verdict({ grade: "green" }), "agent-1").risk).toBe("green");
    expect(rowFromVerdict(verdict({ grade: "identical" }), "agent-1").risk).toBe("clean");
  });
});

describe("what changed — one phrase", () => {
  it("names the removed variable for a scan finding", () => {
    const row = rowFromUsage(
      usage({
        worstSeverity: "breaking",
        findings: [{ driftClass: "missing_variable", severity: "breaking", detail: { keys: ["topic"] } }],
      }),
    );
    expect(row.whatChanged).toBe("A variable it stores was removed (topic)");
  });

  it("uses the server's first finding and counts the rest", () => {
    const row = rowFromVerdict(
      verdict({
        grade: "red",
        findings: [
          { rule_id: "var.removed", grade: "red", message: "a variable was removed: topic" },
          { rule_id: "prompt.changed", grade: "green", message: "the instructions were edited" },
        ],
      }),
      "agent-1",
    );
    expect(row.whatChanged).toBe("A variable was removed: topic (+1 more)");
  });

  it("says a tracks-latest rung follows the newest version, not the server's paragraph", () => {
    const row = rowFromVerdict(
      verdict({
        blocker: "tracks_latest",
        pinned_version_id: null,
        pinned_version_number: null,
        findings: [
          {
            rule_id: "blocker.tracks_latest",
            grade: "identical",
            message:
              "this job follows the agent's live definition rather than a pinned version, so your change already applies to it and there is no pin to move",
          },
          { rule_id: "model.changed_same_provider", grade: "green", message: "the model changed (still Google)" },
        ],
      }),
      "agent-1",
    );
    expect(row.whatChanged).toBe(
      "Follows the newest version — your change already applies · the model changed (still Google)",
    );
    expect(row.behind).toBe(false);
    expect(row.pinnedLabel).toBe("latest");
  });

  it("flags unmeasured settings so a green row never reads as clean", () => {
    const row = rowFromVerdict(
      verdict({ settings_drift: { capability_checked: false, capability: [], keys: [] } }),
      "agent-1",
    );
    expect(row.whatChanged).toContain("settings unmeasured");
  });

  it("names the duplicate a mandate was reached through", () => {
    const row = rowFromVerdict(
      verdict({
        agent_id: "agent-2",
        agent_name: "Agent (copy)",
        lineage_path: [
          { agent_id: "agent-1", agent_name: "Agent", relation: "self" },
          { agent_id: "agent-2", agent_name: "Agent (copy)", relation: "duplicated_from" },
        ],
      }),
      "agent-1",
    );
    expect(row.subtitle).toBe("default · on duplicate “Agent (copy)”");
  });
});

describe("the counts strip", () => {
  it("counts every dimension, zero included, and flags only red and orange", () => {
    const counts = countByDimension(
      [
        rowFromVerdict(verdict({ grade: "red" }), "agent-1"),
        rowFromVerdict(verdict({ row_id: "row-2", grade: "green" }), "agent-1"),
        rowFromUsage(usage({ worstSeverity: "info" })),
      ],
      DIMENSION_ORDER,
    );
    expect(Object.keys(counts).sort()).toEqual([...DIMENSION_ORDER].sort());
    expect(counts.mandate).toEqual({ total: 2, flagged: 1, behind: 2 });
    expect(counts.shortcut).toEqual({ total: 1, flagged: 0, behind: 1 });
    expect(counts.app).toEqual({ total: 0, flagged: 0, behind: 0 });
  });
});
