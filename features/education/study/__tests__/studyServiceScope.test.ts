import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "..", "service", "studyService.ts"),
  "utf8",
);

function methodSource(name: string): string {
  const match = source.match(
    new RegExp(`\\n  async ${name}\\([\\s\\S]*?\\n  \\},`),
  );
  if (!match) throw new Error(`studyService.${name} source not found`);
  return match[0];
}

describe("studyService declares the product-view user scope", () => {
  const createdByScopedMethods = [
    "listSessions",
    "getAttemptSummariesForSessions",
    "getSession",
    "deleteSession",
    "updateSession",
    "appendSessionArtifact",
    "attemptsForItem",
    "overrideAttempt",
    "getMastery",
    "getMasteryBulk",
    "setCollapseState",
    "listMastery",
    "listDue",
    "listWeakest",
    "listAttemptsForItem",
    "listAttempts",
    "listAllMastery",
    "listAllAttempts",
    "listGoals",
    "updateGoal",
    "deleteGoal",
  ];

  test.each(createdByScopedMethods)(
    "%s filters by the authenticated owner instead of relying on RLS as the view",
    (method) => {
      const body = methodSource(method);
      expect(body).toMatch(/const userId = (?:getUserId|requireUserId)\(\)/);
      expect(body).toContain('.eq("created_by", userId)');
    },
  );

  it("scopes every read and compare-and-swap in multi-query methods", () => {
    expect(
      methodSource("getSession").match(/\.eq\("created_by", userId\)/g),
    ).toHaveLength(2);
    expect(
      methodSource("appendSessionArtifact").match(
        /\.eq\("created_by", userId\)/g,
      ),
    ).toHaveLength(2);
  });

  it("filters the one-row streak query by its user_id owner key", () => {
    const body = methodSource("getStreak");
    expect(body).toContain("const userId = requireUserId()");
    expect(body).toContain('.eq("user_id", userId)');
    expect(body).toContain(".maybeSingle()");
  });
});
