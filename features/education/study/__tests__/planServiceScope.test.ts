import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "..", "service", "planService.ts"),
  "utf8",
);

function methodSource(name: string): string {
  const match = source.match(
    new RegExp(`\\n  async ${name}\\([\\s\\S]*?\\n  \\},`),
  );
  if (!match) throw new Error(`planService.${name} source not found`);
  return match[0];
}

describe("planService declares the learner view", () => {
  test.each(["listPlans", "getActiveDailyItemCap", "getPlan"])(
    "%s scopes plan reads to the authenticated owner",
    (method) => {
      const body = methodSource(method);
      expect(body).toContain("const userId = requireUserId()");
      expect(body).toContain('.eq("created_by", userId)');
    },
  );

  it("scopes the plan and both child reads", () => {
    expect(
      methodSource("getPlan").match(/\.eq\("created_by", userId\)/g),
    ).toHaveLength(3);
  });

  test.each([
    "updatePlanStatus",
    "updatePlanTitle",
    "updateBlockStatus",
    "updateBlock",
    "deleteBlock",
    "deletePlan",
  ])("%s scopes its mutation to the authenticated owner", (method) => {
    const body = methodSource(method);
    expect(body).toContain("const userId = requireUserId()");
    expect(body).toContain('.eq("created_by", userId)');
  });

  test.each(["updatePlanTitle", "updateBlock", "deleteBlock"])(
    "%s uses the shared version compare-and-swap helper",
    (method) => {
      const body = methodSource(method);
      expect(body).toContain("guardedUpdate<");
      expect(body).toContain("expectedVersion,");
      expect(body).toContain("version: nextVersion");
      expect(body).toContain('.eq("version", expected)');
      expect(body).toContain("fetchCurrent:");
    },
  );

  it("creates blocks with the owned parent plan's explicit organization", () => {
    const body = methodSource("createBlock");
    expect(body).toContain('.from("study_plan")');
    expect(body).toContain('.eq("created_by", userId)');
    expect(body).toMatch(
      /organization_id:\s*\(plan as \{ organization_id: string \}\)\s*\.organization_id/,
    );
  });
});
