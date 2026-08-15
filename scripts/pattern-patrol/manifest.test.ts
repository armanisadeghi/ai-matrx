import {
  automationUpdateSpecs,
  PATROL_DELIVERY_POLICY,
  PATROLS,
  registryScheduleTable,
} from "./manifest";
import { parseAutomationToml } from "./check-manifest";

describe("Pattern Patrol typed manifest", () => {
  it("owns ten unique product patrols plus fleet health", () => {
    expect(PATROLS).toHaveLength(10);
    expect(new Set(PATROLS.map((patrol) => patrol.patrolId)).size).toBe(10);
    expect(new Set(PATROLS.map((patrol) => patrol.automationId)).size).toBe(10);
    expect(automationUpdateSpecs()).toHaveLength(11);
  });

  it("generates every required common contract once per product prompt", () => {
    for (const spec of automationUpdateSpecs().filter(
      (candidate) => candidate.executionEnvironment === "worktree",
    )) {
      for (const contract of [
        "WORKTREE ISOLATION",
        "BASELINE-DELTA CERTIFICATION CONTRACT",
        "ENFORCED PREVIEW LEASE",
        "FAST INTEGRATION CONTRACT",
        "SERIALIZED RELEASE LANE",
        "LOUD FAILURE CONTRACT",
        "HUMAN EXCEPTION CONTRACT",
      ]) {
        expect(spec.prompt.match(new RegExp(contract, "g"))).toHaveLength(1);
      }
    }
  });

  it("treats fast integration as health and defers production protection", () => {
    expect(PATROL_DELIVERY_POLICY.preProductionFastIntegration).toBe(true);
    const allPrompts = automationUpdateSpecs()
      .map((spec) => spec.prompt)
      .join("\n");
    expect(allPrompts).toContain(
      "Direct integration is normal in pre-production",
    );
    expect(allPrompts).not.toContain("MUST NOT move origin/main");
    expect(allPrompts).not.toContain("controller-only credentials");
  });

  it("generates a registry row for every automation", () => {
    const table = registryScheduleTable();
    for (const patrol of PATROLS) {
      expect(table).toContain(`| ${patrol.patrolId} |`);
      expect(table).toContain(`\`${patrol.automationId}\``);
    }
  });

  it("parses the Codex TOML fields used by the drift checker", () => {
    expect(
      parseAutomationToml(
        'id = "example"\nprompt = "line one\\nline two"\ncwds = ["/repo"]\ntarget = { type = "project", project_id = "project-1" }\n',
      ),
    ).toMatchObject({
      id: "example",
      prompt: "line one\nline two",
      cwds: ["/repo"],
      project_id: "project-1",
    });
  });
});
