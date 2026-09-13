// DD-183 — a DATABASE consumer is a consumer.
//
// `disposition.ts` decides whether a settings row tells a person their setting
// "is not available yet". Its entries were written from a SOURCE census, and a
// source grep cannot see inside `pg_proc`: the record store resolves
// `records.confirmation.table_allows_born_confirmed` from
// `platform._stamp_actor_tier` on every write, and ~50 `hr.*` keys are consumed
// ONLY from inside database functions. A screen that calls a working setting
// dead is law 4 broken in the direction that looks cautious.
//
// The live census is generated into `knobDatabaseConsumers.generated.ts`, and
// these cases hold the two halves of the contract: the census is REAL (measured
// from the live catalog, not an empty stub that would make the guard vacuous),
// and `dispositionFor` obeys it.

import { dispositionFor, auditedSettingsDispositions } from "../disposition";
import { KNOB_DATABASE_CONSUMERS, databaseConsumersOf } from "../knobDatabaseConsumers.generated";

it("carries a real in-database census, not an empty stub", () => {
  // The generator refuses to write an empty file; this is the assertion that
  // makes every case below mean something.
  expect(Object.keys(KNOB_DATABASE_CONSUMERS).length).toBeGreaterThan(50);
  expect(databaseConsumersOf("records.confirmation.table_allows_born_confirmed")).toContain(
    "platform._stamp_actor_tier",
  );
  expect(databaseConsumersOf("records.confirmation.confirm_on_human_edit")).toContain(
    "content_ir.edit_kind_instance_value",
  );
  expect(databaseConsumersOf("records.confirmation.list_hides_unconfirmed")).toBeNull();
});

it("never calls a knob the database reads 'not available yet', whatever the hand audit says", () => {
  const dbConsumed = Object.keys(KNOB_DATABASE_CONSUMERS)[0];
  expect(dbConsumed).toBeTruthy();
  for (const context of ["organization", "user", "system"] as const) {
    expect(dispositionFor(dbConsumed, context)).toBeNull();
  }
});

it("still states the gap for a key nothing reads, in source or in the database", () => {
  const stateOnly = dispositionFor("records.confirmation.list_hides_unconfirmed", "organization");
  expect(stateOnly).not.toBeNull();
  expect(stateOnly?.consumerEvidence).toContain("pg_proc");
});

it("leaves every audited key that a database function reads out of the state-only set", () => {
  // The invariant, over the WHOLE hand-kept map rather than one example: if the
  // two sources ever disagree, the measured one wins and this proves it.
  const contradicting = Object.keys(auditedSettingsDispositions).filter(
    (fullKey) =>
      databaseConsumersOf(fullKey) !== null &&
      auditedSettingsDispositions[fullKey].stateOnlyAt.length > 0 &&
      dispositionFor(fullKey, "organization") !== null,
  );
  expect(contradicting).toEqual([]);
});
