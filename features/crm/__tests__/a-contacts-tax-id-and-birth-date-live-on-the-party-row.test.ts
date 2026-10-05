/**
 * The tax ID / date of birth live on crm.party (the confidential split was withdrawn and never applied
 * to production). No CRM code may call a `crm_party_confidential_*` door, and the identity card edits
 * both columns like every other field.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CRM_GUARD_ROOT ?? join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("a contact's tax ID and date of birth", () => {
  it("never go through a confidential door that production does not have", () => {
    const hits = sources(root).filter((f) =>
      /crm_party_confidential_/.test(readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });

  it("are edited on the identity card", () => {
    const card = readFileSync(
      join(root, "components/record/PartyIdentityCard.tsx"),
      "utf8",
    );
    expect(card).toMatch(/key: "date_of_birth"/);
    expect(card).toMatch(/key: "tax_id"/);
  });
});

describe("the date of birth filter", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { applyBirthDateFilter } = require("../service") as typeof import("../service");
  const run = (v: string) => {
    const calls: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "gte", "lt"]) {
      q[m] = (c: string, x: string) => (calls.push(`${m} ${c} ${x}`), q);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    applyBirthDateFilter(q as any, v);
    return calls;
  };
  it("answers a day, a month or a year", () => {
    expect(run("1984-03-27")).toEqual(["eq date_of_birth 1984-03-27"]);
    expect(run("1984-12")).toEqual(["gte date_of_birth 1984-12-01", "lt date_of_birth 1985-01-01"]);
    expect(run("1984")).toEqual(["gte date_of_birth 1984-01-01", "lt date_of_birth 1985-01-01"]);
    expect(run("march")).toEqual([]);
  });
});
