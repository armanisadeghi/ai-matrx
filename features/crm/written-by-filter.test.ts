// features/crm/written-by-filter.test.ts
//
// DD-131 slice 3 (c) — ONE chip on the Customers grid, and it is a REAL server
// predicate over the columns the database fills from the write door's
// declaration (`wf_056`).
//
// WHY THIS FILE EXISTS AT ALL. A filter chip that renders but narrows nothing
// is the exact failure Law 4 names: a control that looks alive and lies. So the
// thing under test here is not the chip's appearance — it is the SQL predicate
// `applyPartyListPredicates` builds, captured from a recorder that answers the
// way PostgREST does, plus the round trip between the chip's value and the
// service's filter bag (an agent write and a user click must produce the
// identical bag).
//
// The other half of this class — that the DOORS fill those columns honestly, so
// there is anything true to filter on — is proven against the live database in
// `aidream/services/crm/tests/test_party_provenance.py`. A predicate over
// columns nothing writes would pass here and be worthless.
//
// RED against the shipped grid (no `written_by` anywhere): every test below
// fails at the type level, and with the branch removed but the type kept, the
// first two return a builder carrying NO `created_by_tier` predicate — the chip
// that narrows nothing. Proven by deleting the branch in a scratch copy,
// 2026-09-13.

import { applyPartyListPredicates } from "./service";
import {
  DEFAULT_RECORD_CLASS_FILTER,
  DEFAULT_WRITTEN_BY_FILTER,
  WRITTEN_BY_FILTERS,
  WRITTEN_BY_FILTER_LABEL,
  type PartyListQuery,
} from "./types";

/** Records every predicate the service asks for, and chains like PostgREST. */
function recorder() {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "is", "not", "ilike", "gte", "or"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return { builder, calls };
}

const CTX = {
  userId: "87a6e699-3622-4869-8843-d0867456c0dd",
  orgIds: ["7cd12da2-2213-4378-8fba-a9e2dc4ea657"],
};

function query(written_by?: PartyListQuery["filters"]["written_by"]): PartyListQuery {
  return {
    scope: { kind: "mine" },
    search: "",
    kind: "all",
    filters: { record_class: DEFAULT_RECORD_CLASS_FILTER, written_by },
    page: 1,
    view: "active",
  };
}

function predicatesFor(written_by?: PartyListQuery["filters"]["written_by"]) {
  const { builder, calls } = recorder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyPartyListPredicates(builder as any, query(written_by), CTX as any);
  return calls.filter(
    (c) =>
      c.method === "eq" &&
      typeof c.args[0] === "string" &&
      (c.args[0] as string).endsWith("_by_tier"),
  );
}

describe("the Customers grid's one provenance chip is a real predicate", () => {
  it("'Added by an agent' narrows to rows an AI created", () => {
    expect(predicatesFor("agent")).toEqual([
      { method: "eq", args: ["created_by_tier", "ai"] },
    ]);
  });

  it("'Agent-written then edited' adds the second fact, it is not a third kind", () => {
    expect(predicatesFor("agent_edited")).toEqual([
      { method: "eq", args: ["created_by_tier", "ai"] },
      { method: "eq", args: ["updated_by_tier", "human"] },
    ]);
  });

  it("the default narrows NOTHING — one grid until somebody asks", () => {
    // A person's contact and an agent's sit in the same list by default. If
    // this ever produced a predicate, the grid would be quietly hiding rows
    // nobody asked it to hide.
    expect(predicatesFor(undefined)).toEqual([]);
    expect(predicatesFor(DEFAULT_WRITTEN_BY_FILTER)).toEqual([]);
  });

  it("a person's contact is absent from the agent filter by construction", () => {
    // The chair's own control, stated as the predicate that enforces it: the
    // filter asks for created_by_tier = 'ai', and a person's row carries
    // 'human' or NULL. Neither equals 'ai', so no `.eq` can return it — there
    // is no branch in which a hand-created contact appears under this chip.
    const [only] = predicatesFor("agent");
    expect(only.args).toEqual(["created_by_tier", "ai"]);
    expect(["human", null]).not.toContain(only.args[1]);
  });
});

describe("the chip's vocabulary", () => {
  it("offers exactly the chair's two questions plus the way out", () => {
    expect([...WRITTEN_BY_FILTERS]).toEqual(["anyone", "agent", "agent_edited"]);
    expect(WRITTEN_BY_FILTER_LABEL.agent).toBe("Added by an agent");
    expect(WRITTEN_BY_FILTER_LABEL.agent_edited).toBe("Agent-written then edited");
  });
});
