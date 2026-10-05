/**
 * K6 (kind-never-raw round 7): THE LEAK SENTINEL watches every route group.
 * It rides `DeferredSingletonCore`, which only the `Providers` / `AppShell`
 * groups mount — so a group with its own bare layout ((auth-pages),
 * (oauth-review)) had no sentinel at all. Every route group's root layout
 * must reach it: through Providers / AppShell, or by mounting
 * `<KindLeakSentinel />` itself. (popup) is an unused demo and is skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "../../../app");
const SKIPPED = new Set(["(popup)"]);
const REACHES_SENTINEL = /<(?:Providers|AppShell|KindLeakSentinel)\b/;

const groups = readdirSync(APP).filter((name) => /^\(.+\)$/.test(name) && !SKIPPED.has(name));

describe("every route group mounts the kind leak sentinel", () => {
  it("finds the route groups", () => {
    expect(groups).toEqual(expect.arrayContaining(["(auth-pages)", "(oauth-review)", "(core)", "(public)"]));
  });

  it.each(groups)("%s", (group) => {
    const dir = path.join(APP, group);
    const layouts = readdirSync(dir).filter((f) => /^layout(?:\.[a-z]+)?\.tsx$/.test(f) && !f.includes(".test."));
    expect(layouts.length).toBeGreaterThan(0);
    const reaches = layouts.some((f) => REACHES_SENTINEL.test(readFileSync(path.join(dir, f), "utf8")));
    expect({ group, reaches }).toEqual({ group, reaches: true });
  });
});
