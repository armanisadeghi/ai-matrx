/**
 * WALL W12 — THE REJECT DIALOG THAT WOULD NOT SUBMIT.
 *
 * Trial `teach-recent-interview`, first scored run (2026-09-15): an Expert
 * reviewing 34 draft rules could reject some and not others. Six rows refused
 * 6–8 times each with "This Rulebook changed while you were editing (someone
 * else saved a newer version)" — while she was the only person on the page.
 *
 * She was not the only WRITER. Every rules save fires `pokeUnderstudy` →
 * `POST /masterworks/understudy/refresh`, and the server's hook behind it
 * (`rulebook_writes._poke_understudy` → `_poke_coherence`) wakes the Coherence
 * Partner, which writes `metadata.coherence` back onto the SAME
 * `platform.rulebook` row a second or two later. `platform._touch_row` bumps
 * `version` on that write, so the version the page is holding — the one its
 * own last save just returned — is stale before the next decision is made.
 * Whether the next Reject landed was pure timing, which is exactly the
 * some-rules-yes-some-rules-no signature in the register.
 *
 * These cases drive the REAL `saveRules` against a fake `platform.rulebook`
 * that behaves the way the live row does. Case 1 is the wall itself and FAILS
 * before the fix. Cases 2 and 3 are the other half of the class: a rebase must
 * never become a blanket retry that overwrites someone's real edit.
 */

const pokeUnderstudy = jest.fn();
jest.mock("../understudy/refresh", () => ({
  pokeUnderstudy: (...args: unknown[]) => pokeUnderstudy(...args),
}));

interface Row {
  id: string;
  version: number;
  rules: unknown[];
  sections: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  source: Record<string, unknown>;
}

let row: Row;

/** A fake `platform.rulebook` with the real row's CAS behaviour. */
function table() {
  const filters: Record<string, unknown> = {};
  let payload: Record<string, unknown> | null = null;
  const api = {
    update(next: Record<string, unknown>) {
      payload = next;
      return api;
    },
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return api;
    },
    is() {
      return api;
    },
    async maybeSingle() {
      if (payload === null) {
        return { data: filters.id === row.id ? { ...row } : null, error: null };
      }
      if (filters.id !== row.id || filters.version !== row.version) {
        // CAS miss: PostgREST returns no row, not an error.
        return { data: null, error: null };
      }
      row = { ...row, ...payload, version: row.version + 1 } as Row;
      return { data: { ...row }, error: null };
    },
  };
  return api;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => table() }) },
}));

import { saveRules } from "../service";
import type { Rulebook, RulebookRule } from "../types";

const RULES: RulebookRule[] = [
  { id: "r1", name: "Train to tolerate discomfort", statement: "…" },
  { id: "r2", name: "Protect the mission, not your image", statement: "…" },
] as unknown as RulebookRule[];

/** What the Coherence Partner does, a beat after our own save. */
function coherencePartnerWrites() {
  row = {
    ...row,
    version: row.version + 1,
    metadata: {
      ...(row.metadata ?? {}),
      coherence: { tensions: [], fingerprint: "abc" },
    },
  };
}

function baseFromRow(): Rulebook {
  return {
    ...row,
    rules: row.rules as RulebookRule[],
  } as unknown as Rulebook;
}

const rejected = (rules: RulebookRule[], id: string): RulebookRule[] =>
  rules.map((r) =>
    r.id === id
      ? ({ ...r, draft: true, rejected: true, feedback: "Generic advice." } as RulebookRule)
      : r,
  );

beforeEach(() => {
  pokeUnderstudy.mockReset();
  row = {
    id: "rb1",
    version: 31,
    rules: JSON.parse(JSON.stringify(RULES)),
    sections: { G: { label: "General" } },
    metadata: { intake: { goal: "coach" } },
    source: {},
  };
});

describe("Wall W12 — the Expert's next decision after her own save", () => {
  it("rejects a second rule after OUR OWN save woke the Coherence Partner", async () => {
    // She rejects the first rule. This lands.
    const afterFirst = await saveRules({
      base: baseFromRow(),
      rules: rejected(RULES, "r1"),
    });
    expect(afterFirst.version).toBe(32);

    // A beat later the Partner our save woke writes metadata.coherence back
    // onto the same row. The page never hears about it.
    coherencePartnerWrites();
    expect(row.version).toBe(33);

    // She rejects the second rule, from the version her own save returned.
    // Before the fix this threw "changed while you were editing" — forever,
    // because every retry sent the same stale number.
    const afterSecond = await saveRules({
      base: afterFirst,
      rules: rejected(afterFirst.rules, "r2"),
    });
    expect(afterSecond.version).toBe(34);
    const r2 = afterSecond.rules.find((r) => r.id === "r2") as RulebookRule & {
      rejected?: boolean;
      feedback?: string;
    };
    expect(r2.rejected).toBe(true);
    expect(r2.feedback).toBe("Generic advice.");
    // And the Partner's work is still there — a rebase is not an overwrite.
    expect((row.metadata as Record<string, unknown>).coherence).toBeDefined();
  });

  it("still REFUSES when someone really did change the rules", async () => {
    const base = baseFromRow();
    // Another reviewer approves r2 and saves first.
    row = {
      ...row,
      version: 32,
      rules: [row.rules[0], { ...(row.rules[1] as object), draft: false }],
    };
    await expect(
      saveRules({ base, rules: rejected(RULES, "r1") }),
    ).rejects.toThrow(/changed while you were editing/);
    // Their approval survived.
    expect((row.rules[1] as { draft?: boolean }).draft).toBe(false);
  });

  it("still REFUSES a whole-metadata write when metadata moved", async () => {
    // The Final Checkup read-modify-writes the WHOLE metadata column, so
    // rebasing it would silently drop what the Partner just wrote.
    const base = baseFromRow();
    coherencePartnerWrites();
    await expect(
      saveRules({
        base,
        rules: rejected(RULES, "r1"),
        metadata: { intake: { goal: "coach" }, checkup: { dismissed: ["f1"] } },
      }),
    ).rejects.toThrow(/changed while you were editing/);
    expect((row.metadata as Record<string, unknown>).coherence).toBeDefined();
  });
});
