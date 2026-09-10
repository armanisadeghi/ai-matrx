import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "useEngageMeta.ts"), "utf8");

function hookSource(name: string): string {
  const start = source.indexOf(`export function ${name}()`);
  if (start < 0) throw new Error(`${name} source not found`);
  const next = source.indexOf("export function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

describe("engagement metadata authentication boundary", () => {
  it.each([
    ["useStreak", "studyService.getStreak"],
    ["useBadges", "gameService.listMyBadges"],
    ["useLeague", "gameService.getMyLeagueMembership"],
  ])("does not read %s metadata until a user is hydrated", (hook, read) => {
    const body = hookSource(hook);
    expect(body).toContain("const userId = useAppSelector(selectUserId)");
    expect(body).toMatch(/if \(!userId\) \{[\s\S]*?setLoading\(false\);[\s\S]*?return;/);
    expect(body).toContain(read);
  });

  it("re-runs the initial readers only when the authenticated identity changes", () => {
    expect(hookSource("useStreak")).toContain("}, [userId]);");
    expect(hookSource("useBadges")).toContain("}, [userId]);");
    expect(hookSource("useLeague")).toContain("}, [userId]);");
  });
});
