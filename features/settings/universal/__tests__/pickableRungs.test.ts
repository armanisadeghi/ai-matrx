/**
 * DD-211 — the picker offers a rung only when the database can answer with it.
 *
 * These run against the COMMITTED census (`knobDatabaseConsumers.generated.ts`),
 * which `pnpm check:knob-database-consumers` re-measures against `pg_proc` and
 * fails when it drifts. So a rung that stops being answerable makes the guard
 * fail first and these assertions change with the census — never the other way
 * round.
 */
import { pickableRungsFor } from "../scopeRows";
import { KNOB_RUNG_CONSUMERS, unreachableRungsFor } from "../knobDatabaseConsumers.generated";

const AGENT_KNOB = "records.confirmation.agent_write_born_confirmed";
const EDIT_KNOB = "records.confirmation.confirm_on_human_edit";

describe("pickableRungsFor", () => {
  it("offers the agent rung on the born-confirmed knob, because the carrier names it (DD-211)", () => {
    expect(KNOB_RUNG_CONSUMERS[AGENT_KNOB]).toContain("agent");
    expect(pickableRungsFor(["organization", "agent"], AGENT_KNOB)).toEqual(["agent"]);
  });

  it("does NOT offer a rung the key's readers never name — absent, not a dead control", () => {
    // The human-edit knob's reader names only the table rung. Were `agent` ever
    // added to its `overridable_by`, the picker must not sell it.
    expect(KNOB_RUNG_CONSUMERS[EDIT_KNOB]).toEqual(["table"]);
    expect(unreachableRungsFor(EDIT_KNOB, ["organization", "table", "agent"])).toEqual(["agent"]);
    expect(pickableRungsFor(["organization", "table", "agent"], EDIT_KNOB)).toEqual(["table"]);
  });

  it("hides nothing when the key has no measurable database reader — never guess", () => {
    expect(unreachableRungsFor("some.key_no_function_reads", ["organization", "agent"])).toEqual([]);
    expect(pickableRungsFor(["organization", "agent"], "some.key_no_function_reads")).toEqual(["agent"]);
  });

  it("hides nothing when no key is given at all", () => {
    expect(pickableRungsFor(["organization", "table", "agent"])).toEqual(["table", "agent"]);
  });

  it("never hides organization or user — they are knob_resolve's own parameters", () => {
    // Neither is a pickable rung on this surface anyway; what matters is that the
    // census can never make them look unreachable.
    expect(unreachableRungsFor(EDIT_KNOB, ["organization", "user"])).toEqual([]);
  });
});
