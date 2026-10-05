import { readFileSync } from "node:fs";
import { join } from "node:path";
import { plannedCardCount } from "../generateDeckFromSources";

describe("plannedCardCount: the count shown matches the plan", () => {
  it("raises to one card per source", () => {
    expect(plannedCardCount(4, 5)).toBe(5);
  });
  it("keeps the ask when it covers every source or there is one source", () => {
    expect(plannedCardCount(10, 5)).toBe(10);
    expect(plannedCardCount(3, 1)).toBe(3);
    expect(plannedCardCount(3, 0)).toBe(3);
  });
  it("Create deck shows the planned count in progress and summary, never the typed one", () => {
    const src = readFileSync(join(__dirname, "../../components/create/CreateDeckPage.tsx"), "utf8");
    expect(src).toContain("cardProgressLine(progress, runPlanned ?? plannedCount)");
    expect(src).not.toContain("cardProgressLine(progress, safeCount)");
  });
});
