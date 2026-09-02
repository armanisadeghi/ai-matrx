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
});
