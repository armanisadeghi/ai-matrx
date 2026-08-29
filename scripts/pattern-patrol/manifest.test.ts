import {
  automationUpdateSpecs,
  FLEET_HEALTH,
  PATROL_DELIVERY_POLICY,
  PATROL_PATHS,
  PATROLS,
  registryScheduleTable,
} from "./manifest";
import { parseAutomationToml } from "./check-manifest";

describe("Pattern Patrol typed manifest", () => {
  it("owns thirteen unique product patrols plus fleet health", () => {
    expect(PATROLS).toHaveLength(13);
    expect(new Set(PATROLS.map((patrol) => patrol.patrolId)).size).toBe(
      PATROLS.length,
    );
    expect(new Set(PATROLS.map((patrol) => patrol.automationId)).size).toBe(
      PATROLS.length,
    );
    expect(automationUpdateSpecs()).toHaveLength(PATROLS.length + 1);
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
        "RESUME UNFINISHED WORK",
        "LOUD FAILURE CONTRACT",
        "HUMAN EXCEPTION CONTRACT",
        "PROFESSIONAL IMPROVEMENT AUTHORITY",
        "ERADICATION CONTRACT",
        "MAINTENANCE CONTRACT",
        "NO DETECTION-ONLY TERMINAL STATE",
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

  it("grants standing authority for obvious professional improvements", () => {
    const specs = automationUpdateSpecs();
    const productPrompts = specs.filter(
      (candidate) => candidate.executionEnvironment === "worktree",
    );
    for (const spec of productPrompts) {
      expect(spec.prompt).toContain(
        "Known bugs, generic states, missing established affordances",
      );
      expect(spec.prompt).toContain(
        "If a debatable enhancement surrounds a clear core repair, ship the core",
      );
    }
    expect(
      PATROLS.find((patrol) => patrol.patrolId === "P8")?.runInstruction,
    ).toContain("every verified generic loader automatically");
  });

  it("keeps every known-backlog patrol in execution mode", () => {
    for (const patrol of PATROLS) {
      expect(patrol.mode).toBe("ERADICATION");
    }
    for (const prompt of automationUpdateSpecs()
      .filter((candidate) => candidate.executionEnvironment === "worktree")
      .map((candidate) => candidate.prompt)) {
      expect(prompt).toContain("Every worker implements and verifies");
      expect(prompt).toContain(
        "Known actionable backlog may not be marked closed, clean, or complete",
      );
      expect(prompt).not.toContain("Remain report-only");
    }
  });

  it("makes fleet health govern repair waves without repeating unchanged defects", () => {
    const fleet = automationUpdateSpecs().find(
      (candidate) => candidate.id === FLEET_HEALTH.automationId,
    );
    expect(fleet?.prompt).toContain("BACKLOG GOVERNOR CONTRACT");
    expect(fleet?.prompt).toContain("inspect new or changed runs only");
    expect(fleet?.prompt).toContain(
      "do not publish a daily catalogue of unchanged defects",
    );
  });

  it("keeps Fleet Health on the workspace-root project with human self-repair contracts", () => {
    const fleet = automationUpdateSpecs().find(
      (candidate) => candidate.id === FLEET_HEALTH.automationId,
    );
    expect(fleet).toMatchObject({
      projectId: FLEET_HEALTH.projectId,
      executionEnvironment: "local",
      destination: "local",
    });
    expect(FLEET_HEALTH.cwd).toBe(PATROL_PATHS.workspaceRoot);
    expect(fleet?.prompt).toContain("ALL-REPOSITORY REPAIR CONTRACT");
    expect(fleet?.prompt).toContain("HUMAN-LANGUAGE CONTRACT");
    expect(fleet?.prompt).toContain("SELF-REPAIR CONTRACT");
  });

  it("promotes P5's compact two-icon instruction into the typed source", () => {
    const instruction = PATROLS.find(
      (patrol) => patrol.patrolId === "P5",
    )?.runInstruction;
    expect(instruction).toContain("compact two-icon CopyButtons pair");
    expect(instruction).toContain(
      "JSON inside the Copy-for-AI dropdown rather than a third control",
    );
    expect(instruction).toContain(
      "Never create large or visibly labeled copy buttons",
    );
    const livePrompt = automationUpdateSpecs().find(
      (spec) => spec.id === "pattern-patrol-p5-copy-everywhere",
    )?.prompt;
    expect(livePrompt).toContain(instruction);
  });

  it("makes P12 backlog-first with a hard three-Surface closure floor", () => {
    const instruction = PATROLS.find(
      (patrol) => patrol.patrolId === "P12",
    )?.runInstruction;
    expect(PATROLS.find((patrol) => patrol.patrolId === "P12")?.mode).toBe(
      "ERADICATION",
    );
    expect(instruction).toContain("Ranked Surface Queue");
    expect(instruction).toContain(
      "at least three unique canonical Surface IDs",
    );
    expect(instruction).toContain("Detector or machinery work never counts");
    expect(instruction).toContain("exact production URL plus interaction path");
    const livePrompt = automationUpdateSpecs().find(
      (spec) => spec.id === "pattern-patrol-p12-surface-values-completeness",
    )?.prompt;
    expect(livePrompt).toContain(instruction);
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
