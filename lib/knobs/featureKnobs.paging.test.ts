/**
 * THE KNOB CATALOGUE IS A LIST WE TREAT AS COMPLETE.
 *
 * THE DEFECT THIS PINS. `platform.feature_knob` holds ~870 live rows against
 * PostgREST's 1000-row cap. A bare `.select()` does not error at the cap: it
 * returns HTTP 206 and a perfectly successful-looking short array. Every knob
 * read in this module is an EXISTENCE CHECK against that array, and a missing
 * address RAISES by design — so the 1001st knob would make `knobInt(...)`
 * report `Missing feature knob "x.y"` for a row that is sitting in the table.
 * The knob system's whole purpose (no silent frozen defaults) fails silently.
 *
 * The fixture below is the same shape scaled down: a fake client that hands
 * back at most TWO rows per request over a three-row table. Read the bare way
 * it comes back 2 of 3 and the third knob is simply absent; read through
 * `readAllRows` it comes back 3 of 3. Both halves run against ONE fake, so the
 * test cannot pass by the fake being generous to the new path.
 */

import {
  __setFeatureKnobPageSizeForTests,
  invalidateFeatureKnobs,
  knobInt,
} from "./featureKnobs";

type Row = { feature: string; key: string; value: unknown };

/** Three knobs; the fake server will only ever hand over two at a time. */
const TABLE: Row[] = [
  { feature: "alpha", key: "one", value: 1 },
  { feature: "alpha", key: "two", value: 2 },
  { feature: "alpha", key: "three", value: 3 },
];

/** What the fake server truncates every response to — PostgREST's cap, shrunk. */
const SERVER_CAP = 2;

/** Every page the module asked for, so the test can prove it actually paged. */
const requestedRanges: Array<{ from: number; to: number }> = [];

function ordered(): Row[] {
  return [...TABLE].sort((a, b) =>
    a.feature === b.feature
      ? a.key.localeCompare(b.key)
      : a.feature.localeCompare(b.feature),
  );
}

/**
 * A PostgREST-shaped fake. `.select()` is a thenable, so awaiting it WITHOUT a
 * `.range()` is the old bare read and gets capped; `.range(from, to)` gets the
 * requested window, still capped at `SERVER_CAP` rows.
 */
function makeQuery(withCount: boolean) {
  let from = 0;
  let to = SERVER_CAP - 1;
  const result = () => {
    const rows = ordered().slice(from, Math.min(to + 1, from + SERVER_CAP));
    return {
      data: rows,
      error: null,
      ...(withCount ? { count: TABLE.length } : {}),
    };
  };
  const query: Record<string, unknown> = {
    order: () => query,
    is: () => query,
    range: (f: number, t: number) => {
      requestedRanges.push({ from: f, to: t });
      from = f;
      to = t;
      return query;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

const fakeClient = {
  schema: () => ({
    from: () => ({
      select: (_cols: string, opts?: { count?: string }) =>
        makeQuery(opts?.count === "exact"),
    }),
  }),
};

// 🚨 `.is("archived_at", null)` — the catalogue reader stopped serving
// archived knobs (settings3, 2026-09-22) and four bespoke fakes of this one
// builder did not grow the verb, so all four went red on
// "…select(...).is is not a function". THE REAL DEBT IS FOUR FAKES OF ONE
// DIALECT; until they are one shared fake, a verb added to
// `lib/knobs/featureKnobs.ts` has to be added in four places.
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => fakeClient,
}));

beforeEach(() => {
  requestedRanges.length = 0;
  invalidateFeatureKnobs();
  __setFeatureKnobPageSizeForTests(SERVER_CAP);
});

afterEach(() => {
  __setFeatureKnobPageSizeForTests(0);
  invalidateFeatureKnobs();
});

describe("the feature-knob catalogue read", () => {
  it("THE BUG: a bare .select() over the same fake returns 2 of 3 knobs", async () => {
    // This is the read this module used to perform, written out verbatim.
    const { data } = (await fakeClient
      .schema()
      .from()
      .select("feature, key, value")) as { data: Row[] };

    expect(data).toHaveLength(2);
    expect(data.map((r) => r.key)).not.toContain("two");
  });

  it("reads every knob, paging past the server's cap", async () => {
    await expect(knobInt("alpha", "one")).resolves.toBe(1);
    await expect(knobInt("alpha", "three")).resolves.toBe(3);
    // The row the capped read dropped. Before the fix this raised
    // `Missing feature knob "alpha.two"` for a row that exists.
    await expect(knobInt("alpha", "two")).resolves.toBe(2);
  });

  it("pages rather than trusting one full-looking response", async () => {
    await knobInt("alpha", "one");
    expect(requestedRanges.length).toBeGreaterThan(1);
    expect(requestedRanges[0]).toEqual({ from: 0, to: SERVER_CAP - 1 });
  });

  it("still raises for an address the complete catalogue does not hold", async () => {
    await expect(knobInt("alpha", "four")).rejects.toThrow(
      /Missing feature knob/,
    );
  });
});
