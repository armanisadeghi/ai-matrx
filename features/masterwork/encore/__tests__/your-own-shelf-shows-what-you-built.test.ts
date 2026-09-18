/**
 * YOUR OWN SHELF SHOWS WHAT YOU BUILT — a forcing function.
 *
 * Cold walk, 2026-09-16: an Expert built two Masterworks, ran one of them to a
 * real, correctly-routed, paid decision, then went to Encore — "the front door
 * of the whole Operator experience" — and found neither of them. The shelf
 * read "Mine 2" and listed two unrelated seeds. Nothing in the build path ever
 * stamps `metadata.released_at`, and every Encore shelf was hard-gated on it,
 * so EVERY Masterwork anyone has ever built was invisible on the one screen
 * whose job is to list what they built — with no reveal and no explanation.
 *
 * The rule this suite holds down: RELEASE GOVERNS OTHER PEOPLE'S SHELVES,
 * NEVER YOUR OWN.
 *
 *   1. Your own built Masterwork is on your shelf whether or not you released
 *      it. This is the whole defect: it fails against the old `releasedBase()`.
 *   2. It is not silently mixed in with released work — the row still carries
 *      `released_at: null`, which is what the card and the column render as
 *      "Draft". A shelf that hid the distinction would be the opposite lie.
 *   3. Other people's shelves stay gated: the `orgs` and `public` reads still
 *      demand the release stamp, because release is what makes a Masterwork
 *      theirs to run.
 *   4. Understudies never reach the shelf. An Understudy is the practice
 *      stand-in a Rulebook bakes for itself — the Rulebook's own "Built" count
 *      skips it, and 20 of them sat in one test org. Dropping the release gate
 *      without this would have replaced an empty shelf with a junk one.
 *
 * The query builder is faked so each shelf's PREDICATES can be read directly —
 * point 3 is a claim about what was asked of the database, and asserting it
 * against a stubbed result set would prove nothing.
 */

const ORG_ID = "org-1";
const USER_ID = "user-1";

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => USER_ID,
}));

jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => [
    { id: ORG_ID, isPersonal: false, name: "Recyclers" },
  ],
}));

jest.mock("../../audition/listAuditionScores", () => ({
  listAuditionScores: async () => [],
  latestScoreByRulebook: () => new Map(),
}));

/** Every predicate one shelf's read declared, in the order it declared them. */
interface Recorded {
  table: string;
  filters: string[];
}

const recorded: Recorded[] = [];

/** Rows the fake `workflow.definition` read returns, keyed by predicate. */
let definitionRows: Record<string, unknown[]> = {};

function makeBuilder(table: string) {
  const entry: Recorded = { table, filters: [] };
  recorded.push(entry);
  const note = (text: string) => {
    entry.filters.push(text);
    return builder;
  };
  const rowsForThisRead = (): unknown[] => {
    if (table !== "definition") return [];
    for (const [key, rows] of Object.entries(definitionRows)) {
      if (!entry.filters.includes(key)) continue;
      // The fake HONOURS the release predicate, because the predicate is the
      // defect: a stub that handed back the same rows whichever filters were
      // asked for would pass against the broken code and prove nothing.
      if (entry.filters.includes("not:metadata->>released_at:is:null")) {
        return rows.filter(
          (row) =>
            typeof (row as { metadata?: Record<string, unknown> }).metadata
              ?.released_at === "string",
        );
      }
      return rows;
    }
    return [];
  };
  const builder = {
    select: () => note("select"),
    is: (column: string, value: unknown) => note(`is:${column}:${String(value)}`),
    eq: (column: string, value: unknown) => note(`eq:${column}:${String(value)}`),
    in: (column: string, values: unknown[]) =>
      note(`in:${column}:${values.join(",")}`),
    not: (column: string, op: string, value: unknown) =>
      note(`not:${column}:${op}:${String(value)}`),
    order: () => note("order"),
    maybeSingle: () => note("maybeSingle"),
    // Awaiting the builder IS the read.
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: rowsForThisRead(), error: null }).then(
        resolve,
        reject,
      ),
  };
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: (table: string) => makeBuilder(table) }),
  },
}));

import { listEncoreShelves } from "../service";

/** A `workflow.definition` row as the Encore columns select it. */
function definitionRow(overrides: {
  id: string;
  name: string;
  released?: boolean;
  understudy?: boolean;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    description: null,
    metadata: {
      built_from_rulebook: "rb-1",
      rule_count: 15,
      ...(overrides.released
        ? { released_at: "2026-09-16T00:00:00.000Z" }
        : {}),
      ...(overrides.understudy ? { understudy: true } : {}),
    },
    version: 1,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    visibility: "internal",
    is_archived: false,
  };
}

const MINE = `eq:created_by:${USER_ID}`;
const FROM_ORGS = `in:organization_id:${ORG_ID}`;
const PUBLIC = "eq:visibility:public";
const RELEASE_GATE = "not:metadata->>released_at:is:null";

beforeEach(() => {
  recorded.length = 0;
  definitionRows = {};
});

describe("release governs other people's shelves, never your own", () => {
  it("puts the Masterwork you just built on your shelf, un-released, marked a draft", async () => {
    definitionRows = {
      [MINE]: [
        definitionRow({ id: "mw-draft", name: "Pallet Manual-Sort Decider" }),
      ],
    };

    const shelves = await listEncoreShelves();
    const mine = shelves.find((shelf) => shelf.scope === "mine");

    // THE DEFECT. Pre-fix this shelf does not exist at all: the read demanded
    // a `released_at` the build path never writes, so it came back empty and
    // `listEncoreShelves` dropped the empty shelf entirely.
    expect(mine).toBeDefined();
    expect(mine?.masterworks.map((m) => m.name)).toEqual([
      "Pallet Manual-Sort Decider",
    ]);
    // And it is not passed off as released — `released_at: null` is exactly
    // what the card renders as "Draft".
    expect(mine?.masterworks[0].released_at).toBeNull();
  });

  it("never asks for the release stamp on your own shelf, and always asks for it on everyone else's", async () => {
    await listEncoreShelves();

    const definitionReads = recorded.filter(
      (read) => read.table === "definition",
    );
    const mineRead = definitionReads.find((read) =>
      read.filters.includes(MINE),
    );
    const orgsRead = definitionReads.find((read) =>
      read.filters.includes(FROM_ORGS),
    );
    const publicRead = definitionReads.find((read) =>
      read.filters.includes(PUBLIC),
    );

    expect(mineRead?.filters).not.toContain(RELEASE_GATE);
    expect(orgsRead?.filters).toContain(RELEASE_GATE);
    expect(publicRead?.filters).toContain(RELEASE_GATE);
  });

  it("keeps Understudies off the shelf — they are practice stand-ins, not work you built", async () => {
    definitionRows = {
      [MINE]: [
        definitionRow({ id: "mw-real", name: "Pallet Triage" }),
        definitionRow({
          id: "mw-understudy",
          name: "Pallet Triage — Understudy",
          understudy: true,
        }),
      ],
    };

    const shelves = await listEncoreShelves();
    const mine = shelves.find((shelf) => shelf.scope === "mine");

    expect(mine?.masterworks.map((m) => m.name)).toEqual(["Pallet Triage"]);
  });
});
