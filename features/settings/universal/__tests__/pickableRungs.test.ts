/**
 * DD-211 — the picker offers a rung only when the database can answer with it.
 *
 * These run against the COMMITTED census (`knobDatabaseConsumers.generated.ts`),
 * which `pnpm check:knob-database-consumers` re-measures against `pg_proc` and
 * fails when it drifts. So a rung that stops being answerable makes the guard
 * fail first and these assertions change with the census — never the other way
 * round.
 */
import { isStrictRungFeature, pickableRungsFor, STRICT_RUNG_FEATURE_PREFIXES } from "../scopeRows";
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

describe("pickableRungsFor inside a STRICT namespace (DD-203)", () => {
  const ANSWERABLE = "hr.employees.adjusted_service_date_rule";
  const DISPATCHED = "hr.approvals.escalation_hours";
  const HR_RUNGS = ["organization", "employer_profile", "pay_group", "location"];

  it("declares hr.* strict, because every hr knob is resolved through a dispatcher that can name no rung", () => {
    expect(STRICT_RUNG_FEATURE_PREFIXES).toEqual(["hr."]);
    expect(isStrictRungFeature(DISPATCHED)).toBe(true);
    expect(isStrictRungFeature("records.confirmation.demo")).toBe(false);
  });

  it("offers all three HR rungs on the key whose reader names them", () => {
    expect(KNOB_RUNG_CONSUMERS[ANSWERABLE]).toEqual(["employer_profile", "location", "pay_group"]);
    expect(pickableRungsFor(HR_RUNGS, ANSWERABLE)).toEqual([
      "employer_profile",
      "pay_group",
      "location",
    ]);
  });

  it("offers NOTHING on an hr key no measurable reader names — silence is an answer here", () => {
    // Outside hr.* the same key would be offered: `unreachableRungsFor` hides
    // nothing it cannot measure, deliberately. Inside hr.* the whole namespace
    // was read out of the catalog, so "not measured" IS "not answerable".
    expect(KNOB_RUNG_CONSUMERS[DISPATCHED]).toBeUndefined();
    expect(unreachableRungsFor(DISPATCHED, HR_RUNGS)).toEqual([]);
    expect(pickableRungsFor(HR_RUNGS, DISPATCHED)).toEqual([]);
    expect(pickableRungsFor(HR_RUNGS, "notes.approvals.escalation_hours")).toEqual([
      "employer_profile",
      "pay_group",
      "location",
    ]);
  });

  it("still hides nothing when no key is given, even for HR-shaped rungs", () => {
    expect(pickableRungsFor(HR_RUNGS)).toEqual(["employer_profile", "pay_group", "location"]);
  });
});
