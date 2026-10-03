/**
 * The remount ledger covers every board item type, and only types whose
 * remount-safety case passes may sleep.
 *
 * SUT: `REMOUNT_LEDGER` (`remount-safety/cases.ts`) against `BOARD_ITEM_TYPES`
 * (`items/catalog.ts`) and the remount-safety case files.
 * Breaks it catches: a new item type with no case; a case file that stopped
 * running a type's case; a type flipped to `sleeps: true` while its case is
 * still a known failure without a named reason (FEATURE.md: a type sleeps
 * when its case passes); a waiver left behind after the type stopped sleeping.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { REMOUNT_LEDGER } from "./remount-safety/cases";

const caseSources = readdirSync(__dirname)
  .filter((f) => f.startsWith("remount-safety.") && f.endsWith(".test.tsx") && f !== "remount-safety.harness.test.tsx")
  .map((f) => readFileSync(join(__dirname, f), "utf8"))
  .join("\n");

describe("the remount ledger", () => {
  it.each(BOARD_ITEM_TYPES.map((t) => [t.key]))("%s has a core and a quiet row and a case that runs it", (key) => {
    expect(REMOUNT_LEDGER[key]).toBeDefined();
    expect(REMOUNT_LEDGER[`${key}:quiet`]).toBeDefined();
    expect(caseSources).toContain(`remountType(\n  "${key}",`);
  });

  it("names no type the catalog does not have", () => {
    const keys = new Set(BOARD_ITEM_TYPES.map((t) => t.key));
    const stray = Object.keys(REMOUNT_LEDGER).filter((k) => !keys.has(k.split(":")[0]));
    expect(stray).toEqual([]);
  });

  it("lets a type sleep only while its remount case passes, or names why it sleeps anyway", () => {
    const sleepingButRed = BOARD_ITEM_TYPES.filter((t) => {
      const row = REMOUNT_LEDGER[t.key];
      return t.sleeps && row?.status !== "passing" && !(row?.status === "failing" && row.sleepsAnyway);
    }).map((t) => t.key);
    expect(sleepingButRed).toEqual([]);
  });

  it("keeps no stale sleeps-anyway waiver", () => {
    const stale = Object.entries(REMOUNT_LEDGER)
      .filter(([key, row]) => row.status === "failing" && row.sleepsAnyway && !BOARD_ITEM_TYPES.find((t) => t.key === key)?.sleeps)
      .map(([key]) => key);
    expect(stale).toEqual([]);
  });

  it("names the owner and the failure of every known-red row", () => {
    const vague = Object.entries(REMOUNT_LEDGER)
      .filter(([, row]) => row.status === "failing" && (!row.owner.trim() || row.why.trim().length < 20))
      .map(([key]) => key);
    expect(vague).toEqual([]);
  });
});
