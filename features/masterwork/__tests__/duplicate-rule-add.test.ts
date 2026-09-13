/**
 * AN IDENTICAL RULE NEVER LANDS TWICE — proven on the WRITE PATH.
 *
 * Expert Book Challenge wall W50 (2026-09-12): the Add-rule dialog saved the
 * Conductor's staged rule (116 rules, v13), then stayed open, prefilled, with
 * the button still live. A second press would have added the same rule again,
 * and nothing on screen said the first had worked.
 *
 * A dialog that closes politely fixes one lane. This pins the rule where every
 * lane meets: `upsertRuleWithRetry`, the canonical CAS append that the editor
 * dialog, the Add-rule window's two tabs and every agent-staged landing all
 * go through. The identical add is REFUSED, with a sentence a person can read,
 * and it never reaches the database.
 *
 * The only thing faked is the Postgres row underneath. The rules, the
 * comparison and the refusal are the real ones.
 *
 * RED BEFORE GREEN: without `findIdenticalRule` on the append branch, the
 * second add writes a 3-rule list and `expect(...).rejects` fails.
 */

const guardedUpdate = jest.fn();

jest.mock("@ai-matrx/data/db", () => ({
  guardedUpdate: (...args: unknown[]) => guardedUpdate(...args),
}));
jest.mock("../understudy/refresh", () => ({ pokeUnderstudy: jest.fn() }));

let row: Record<string, unknown>;

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          }),
        }),
      }),
    }),
  },
}));

import { upsertRuleWithRetry } from "../service";
import { findIdenticalRule, normalizeRuleText } from "../duplicateRules";
import type { RulebookRule } from "../types";

const NO_PETTING: RulebookRule = {
  id: "no-petting-the-raging-child",
  name: "No Petting the Raging Child",
  section: "G",
  statement:
    "Withdraw attention entirely and let the rage burn itself out unattended.",
  severity: "major",
};

beforeEach(() => {
  row = {
    id: "RB1",
    version: 13,
    sections: { G: { label: "General" } },
    rules: [NO_PETTING],
    metadata: {},
  };
  guardedUpdate.mockReset();
  guardedUpdate.mockImplementation(
    async ({
      nextVersion,
      applyUpdate,
    }: {
      expectedVersion: number;
      nextVersion?: number;
      applyUpdate: (a: {
        expectedVersion: number;
        nextVersion: number;
      }) => unknown;
    }) => {
      void applyUpdate;
      void nextVersion;
      return { status: "saved", row: { ...row, version: 14 } };
    },
  );
});

describe("the write path refuses an identical add", () => {
  it("lands a genuinely new rule", async () => {
    const saved = await upsertRuleWithRetry({
      rulebookId: "RB1",
      rule: {
        id: "let-child-conquer-difficulties",
        name: "Let the Child Conquer Difficulties",
        section: "G",
        statement: "Let him work at the shoes unaided.",
        severity: "major",
      },
    });
    expect(saved.version).toBe(14);
    expect(guardedUpdate).toHaveBeenCalledTimes(1);
  });

  it("refuses a second add of the same name AND statement, and writes nothing", async () => {
    await expect(
      upsertRuleWithRetry({
        rulebookId: "RB1",
        // A re-staged draft gets a fresh id — the id is not what makes it a
        // duplicate, the words are.
        rule: { ...NO_PETTING, id: "no-petting-the-raging-child-2" },
      }),
    ).rejects.toThrow(/already in this Rulebook, word for word/);
    expect(guardedUpdate).not.toHaveBeenCalled();
  });

  it("still lets the SAME rule be edited in place", async () => {
    const saved = await upsertRuleWithRetry({
      rulebookId: "RB1",
      rule: { ...NO_PETTING, statement: "Withdraw attention entirely." },
    });
    expect(saved.version).toBe(14);
  });

  it("allows two rules that share a name but say different things", async () => {
    const saved = await upsertRuleWithRetry({
      rulebookId: "RB1",
      rule: {
        ...NO_PETTING,
        id: "no-petting-at-bedtime",
        statement: "Do not sit beside his bed until he sleeps.",
      },
    });
    expect(saved.version).toBe(14);
  });
});

describe("what counts as the same rule", () => {
  it("ignores case, collapsed whitespace and typographic quotes", () => {
    expect(normalizeRuleText("  Don’t  PET   the child ")).toBe(
      "don't pet the child",
    );
    expect(
      findIdenticalRule([NO_PETTING], {
        name: "no petting the raging child",
        statement:
          "Withdraw attention   entirely and let the rage burn itself out unattended.",
      }),
    ).toBe(NO_PETTING);
  });

  it("never calls a rule a duplicate of itself", () => {
    expect(
      findIdenticalRule([NO_PETTING], NO_PETTING, NO_PETTING.id),
    ).toBeNull();
  });

  it("says nothing about a blank candidate", () => {
    expect(
      findIdenticalRule([NO_PETTING], { name: "", statement: "" }),
    ).toBeNull();
  });
});
