import fs from "node:fs";
import path from "node:path";
import { variableInputPlaceholder } from "./variablePlaceholder";

/**
 * Forcing function for the 2026-09-16 Jobs-bar walk, items 1 and 2.
 *
 * These assertions fail against the code as it stood that morning: every
 * variable textarea in the platform rendered
 * `Enter ${label.toLowerCase()}... (hover for voice input)`, so the Understudy
 * card asked "Enter what do you need done? (the job, the audience, the goal)..."
 * under a label that already said it, and instructed a hover on a phone that
 * has none.
 */
describe("variableInputPlaceholder", () => {
  it("invites an answer instead of restating the label", () => {
    expect(variableInputPlaceholder()).toBe("Type your answer");
  });

  it("never instructs a gesture a touch device does not have", () => {
    expect(variableInputPlaceholder()).not.toMatch(/hover/i);
    expect(
      variableInputPlaceholder({
        labelWhenHidden: "What do you need done?",
      }),
    ).not.toMatch(/hover/i);
  });

  it("carries the field's identity ONLY when the label is hidden", () => {
    expect(
      variableInputPlaceholder({ labelWhenHidden: "What do you need done?" }),
    ).toBe("What do you need done?");
    expect(variableInputPlaceholder({ labelWhenHidden: "   " })).toBe(
      "Type your answer",
    );
  });

  it("no variable input anywhere rebuilds the old placeholder", () => {
    const roots = ["features", "components", "lib", "app"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (full.endsWith("variablePlaceholder.ts")) continue;
          if (full.endsWith("variablePlaceholder.test.ts")) continue;
          const body = fs.readFileSync(full, "utf8");
          if (/hover for voice input/.test(body)) offenders.push(full);
        }
      }
    };
    const cwd = process.cwd();
    for (const root of roots) {
      const dir = path.join(cwd, root);
      if (fs.existsSync(dir)) walk(dir);
    }
    expect(offenders).toEqual([]);
  });
});
