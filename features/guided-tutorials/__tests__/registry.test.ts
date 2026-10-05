/**
 * Guided tutorials stay true to the code they point at.
 *
 * 1. Every text slot is layout: ≤60 chars.
 * 2. Every step's `data-tour` target is actually written somewhere in the app's
 *    source — a page redesign that drops an attribute fails here, not in front of
 *    the person the tutorial was sent to.
 * 3. The link a DM card or email carries is the route plus `?tutorial=<id>`.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { GUIDED_TUTORIALS, findTutorial, tutorialHref } from "../registry";

const ROOT = path.resolve(__dirname, "../../..");

function targetsInSource(): Set<string> {
  const out = execSync(
    `grep -rhoE 'data-tour="[a-z0-9-]+"' --include='*.tsx' features components app packages || true`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return new Set(out.split("\n").filter(Boolean).map((m) => m.slice('data-tour="'.length, -1)));
}

describe("guided tutorials registry", () => {
  it("keeps every text slot within 60 characters", () => {
    for (const t of GUIDED_TUTORIALS) {
      for (const text of [t.title, t.summary, ...t.steps.flatMap((s) => [s.title, s.text])]) {
        expect(`${t.id}: ${text}`).toBe(`${t.id}: ${text.slice(0, 60)}`);
      }
    }
  });

  it("has unique ids and unique targets within each tutorial", () => {
    const ids = GUIDED_TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GUIDED_TUTORIALS) {
      const targets = t.steps.map((s) => s.target);
      expect(new Set(targets).size).toBe(targets.length);
      expect(t.route.startsWith("/")).toBe(true);
    }
  });

  it("points every step at a data-tour attribute that exists in the source", () => {
    const present = targetsInSource();
    const missing = GUIDED_TUTORIALS.flatMap((t) =>
      t.steps.filter((s) => !present.has(s.target)).map((s) => `${t.id} → ${s.target}`),
    );
    expect(missing).toEqual([]);
  });

  it("links to the route with the tutorial query key", () => {
    const t = findTutorial("connect-your-ai");
    expect(t).not.toBeNull();
    expect(tutorialHref(t!)).toBe("/bring-your-work?tutorial=connect-your-ai");
    expect(findTutorial("nope")).toBeNull();
  });
});
