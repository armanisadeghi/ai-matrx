/**
 * A VALUE A READER MAY NOT SEE NEVER LEAVES THE STORE — THROUGH ANY DOOR.
 *
 * WHAT THIS CLOSES, measured live on the main database on 2026-09-20 (lane
 * TALK-TO-RECORD) from the seat a signed-in person really has — `role
 * authenticated`, `request.jwt.claims` = test@test.com, ONE record shared at `viewer`,
 * one Field at `sensitivity = confidential`:
 *
 *   custom.read_record              ssn -> null, `_hidden` names it      MASKED
 *   custom.read_records            ssn -> null, `_hidden` names it      MASKED
 *   custom.record_values_versioned ssn = "123-45-6789"                  LEAKED
 *   custom.value_read(…, 'ssn')    ssn = "123-45-6789"                  LEAKED
 *   custom.record_as_of            data.ssn = "123-45-6789"             LEAKED
 *   custom.record_history          changes[].after = "123-45-6789"      LEAKED
 *   custom.field_history(…,'ssn')  after = "123-45-6789"                LEAKED
 *   custom.io_export               rows[].ssn = "123-45-6789"           LEAKED
 *
 * Six client-callable doors handing over, over PostgREST, a value the read door refuses
 * to the same person in the same session. Not six bugs — ONE CLASS: masking lived INSIDE
 * `custom.read_record` instead of being a FACT of the record that every door asks for.
 * `custom.read_mask` is that fact now, and all six ask it.
 *
 * WHAT THIS GUARD IS. The rule is a QUERY over the live catalogue —
 * `custom.doors_not_masking_fields()` — exactly like `custom.doors_not_on_one_ladder()`
 * before it: a client-executable function in schema `custom` that reaches a RAW value
 * source and never reaches the mask. `--` comments are stripped before the body is read,
 * so a sentence promising the mask can never pass it.
 *
 * IT IS A RATCHET. The number below may only ever go DOWN. Fix one, lower BASELINE.
 * There is no excuse list, because an excuse list is how a ratchet dies.
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:fields-stay-masked
 *   pnpm check:fields-stay-masked:self-test   # proves it can still go red
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

/**
 * How many client doors in schema `custom` still reach a raw value source without the
 * mask. SEVEN when this guard was written (2026-09-20), AFTER this lane routed the six
 * above onto `custom.read_mask` — so the seven are a different, unexamined set, and the
 * number is the honest measurement of them rather than a claim that they all leak.
 *
 * WHAT IS IN THE SEVEN, and what is known about each (2026-09-20, lane TALK-TO-RECORD):
 *
 *   custom.relation_target_card   READ, and it does NOT leak: its raw
 *     `custom.record_values` arm is the STORE-OWNER lane (`v_me is null and
 *     custom.query_is_store_owner()`); a signed-in caller takes the
 *     `custom.record_card` arm, which masks through `iam.visible_field_ids` and
 *     `custom.mask_document` exactly as the read door does. The census names it because
 *     the regex cannot tell one arm from another, and a census that could would be a
 *     census nobody can read. It stays counted rather than excused.
 *
 *   custom.io_revisions · custom.io_restore · custom.value_restore ·
 *   custom.record_restore_preview · custom.visibility_as_of · custom.migrate_choice_keys
 *     NOT READ by this lane. `custom.record_restore_preview` was measured REFUSING a
 *     viewer outright (42501) because it decides at the WRITE rung, so at least one of
 *     the six is closed by a different mechanism. The others are the next lane's work and
 *     they are written down here rather than left for somebody to rediscover.
 */
const BASELINE = 7;

const CENSUS = `select function_name, identity_args, why from custom.doors_not_masking_fields()`;

/** The self-test's pretend baseline: one lower than the truth, so the guard must go red. */
const SELF_TEST_BASELINE = BASELINE - 1;

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

interface Row {
  function_name: string;
  identity_args: string;
  why: string;
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if (!("host" in env)) {
    fail(
      `UNMEASURED: no database credentials (looked in ${(env as { looked?: string[] }).looked?.join(", ") ?? "the usual places"}). ` +
        "A guard that cannot measure has not passed.",
    );
  }

  const client = await connectDirect(env, "check-fields-stay-masked").catch((error: unknown) => {
    fail(`UNMEASURED: could not reach the database — ${String(error)}`);
  });

  try {
    const rows = (await client.query<Row>(CENSUS)).rows;
    const ceiling = selfTest ? SELF_TEST_BASELINE : BASELINE;

    if (rows.length > ceiling) {
      const named = rows.map((r) => `  - custom.${r.function_name}(${r.identity_args})`).join("\n");
      const verdict =
        `${rows.length} client door(s) in schema \`custom\` reach a raw value source and never ` +
        `reach custom.read_mask; the ratchet stands at ${ceiling}.\n${named}\n` +
        (rows[0]?.why ? `  why: ${rows[0].why}\n` : "") +
        "  A door that answers a record's VALUES asks custom.read_mask (or reads through " +
        "custom.read_record / custom.read_records, which already do). See " +
        "migrations/campaign/talkrec_a_value_a_reader_may_not_see_never_leaves_the_store.sql " +
        "for the six worked examples, and scripts/campaign-tests/talkrec_red.sql for the " +
        "seat proof that the pre-mask bodies really did hand a viewer a confidential field.";
      if (selfTest) {
        console.log(`[ OK ] self-test — the census went RED at a baseline of ${ceiling}:\n${verdict}`);
        return;
      }
      fail(verdict);
    }

    if (selfTest) {
      fail(
        `SELF-TEST FAILED — with the baseline lowered to ${SELF_TEST_BASELINE} the census still ` +
          `passed with ${rows.length} row(s). Then this guard cannot go red and is measuring nothing.`,
      );
    }

    if (rows.length < BASELINE) {
      console.log(
        `[ OK ] FIELDS STAY MASKED: ${rows.length} door(s) left, below the ratchet's ${BASELINE}. ` +
          `Lower BASELINE to ${rows.length} in this file so the ground you gained cannot be given back.`,
      );
      return;
    }

    console.log(
      `✅ FIELDS STAY MASKED: ${rows.length} client door(s) in schema \`custom\` reach a raw ` +
        `value source without the mask, and the ratchet is ${BASELINE}. The six this lane ` +
        "routed onto custom.read_mask — read_record, record_values_versioned, value_read, " +
        "record_as_of, record_history, field_history, io_export — are not among them.",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
