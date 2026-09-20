/**
 * A LANE SUITE THAT PASSES AS THE SUPERUSER PROVES NOTHING.
 *
 * WHAT THIS CLOSES, measured on the main database on 2026-09-20 (lane STORE-T). An
 * independent sixth pass failed seven store clauses that four lanes had reported green with
 * a green suite each. Four of the seven were `permission denied` from the seat a signed-in
 * person actually has, and NOT ONE of those suites could have seen it, for one reason:
 *
 *   every campaign suite sets `request.jwt.claims` and never sets `role`.
 *
 * `request.jwt.claims` is WHO you are. `role` is WHAT YOU MAY DO. PostgREST sets both on
 * every request it serves; a psql session started with the campaign's own credentials sets
 * neither, so it runs as the role that OWNS `custom.record`. In that seat:
 *
 *   - `custom.assert_client_may_reach` returns on its FIRST line — `pg_has_role(<caller>,
 *     <owner of custom.record>, 'member')` — so the organization wall never runs;
 *   - EXECUTE grants are free, so a door with no grant answers anyway;
 *   - SECURITY INVOKER and SECURITY DEFINER behave identically, so T9's defect is invisible;
 *   - RLS is off and `custom.record` is directly readable, so a suite can assert against the
 *     table instead of against the doors a product actually has.
 *
 * A suite in that seat is testing the store's internals. It is not testing the product.
 *
 * THE RULE: a campaign suite that calls schema `custom` takes the seat —
 * `set local role authenticated`, or `set_config('role', 'authenticated', …)` — before the
 * clauses it asserts. `scripts/campaign-tests/storet_green.sql` is the worked example, and
 * its PART 0 asserts the seat before anything else.
 *
 * THIS IS A RATCHET, not a big-bang. 57 suites predate the rule and rewriting them is their
 * lanes' work, not this guard's; what the guard refuses is GROWTH. Fix one, lower BASELINE.
 * Write a new one without the seat and this check goes red naming your file.
 *
 *   pnpm check:suites-take-the-seat
 *   pnpm check:suites-take-the-seat:self-test   # proves it can still go red
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const DIR = resolve(__dirname, "campaign-tests");

/**
 * The number of suites that called schema `custom` and did NOT take the seat when this guard
 * was written (2026-09-20). It may only ever go DOWN.
 */
const BASELINE = 55;

/** Taking the seat, in either of the two spellings psql and plpgsql use. */
const TAKES_THE_SEAT = /set\s+local\s+role\s+authenticated|set_config\(\s*'role'\s*,\s*'authenticated'/i;
/** Calls the store at all. A suite that never touches `custom.` has no seat to take. */
const TOUCHES_THE_STORE = /\bcustom\./;

function main(): void {
  const selfTest = process.argv.includes("--self-test");

  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const relevant: string[] = [];
  const seated: string[] = [];
  const bare: string[] = [];

  for (const f of files) {
    const body = readFileSync(resolve(DIR, f), "utf8");
    if (!TOUCHES_THE_STORE.test(body)) continue;
    relevant.push(f);
    (TAKES_THE_SEAT.test(body) ? seated : bare).push(f);
  }

  if (relevant.length === 0) {
    console.error(
      "[FAIL] not one suite in scripts/campaign-tests names schema `custom`. Either the " +
        "directory moved or this check is reading the wrong place — and then its green answer " +
        "means nothing.",
    );
    exitAfterDrain(1);
  }

  if (selfTest) {
    // THE RED HALF. With the seat pattern spelled as something no suite contains, EVERY
    // relevant suite must be named — including the ones that really do take the seat.
    const impossible = /set\s+local\s+role\s+nobody_at_all/;
    const wouldBeBare = relevant.filter((f) => !impossible.test(readFileSync(resolve(DIR, f), "utf8")));
    if (wouldBeBare.length !== relevant.length) {
      console.error(
        "[FAIL] SELF-TEST FAILED - with a seat pattern nothing can match, this check did not " +
          `name all ${relevant.length} suites. It is not reading the files it claims to.`,
      );
      exitAfterDrain(1);
    }
    console.log(
      `[ OK ] self-test - with a seat spelling no file contains, the census names all ` +
        `${wouldBeBare.length} suite(s) that touch the store. It can go red.`,
    );
  }

  console.log(
    `[INFO] ${relevant.length} campaign suite(s) call schema custom; ${seated.length} take the ` +
      `seat, ${bare.length} do not (baseline ${BASELINE}).`,
  );

  if (bare.length > BASELINE) {
    console.error(
      `[FAIL] ${bare.length} campaign suites call schema custom without taking the seat, and the ` +
        `baseline is ${BASELINE}. A suite that runs as the role owning custom.record walks ` +
        `through the organization wall on its first line, needs no EXECUTE grant, cannot tell ` +
        `SECURITY INVOKER from SECURITY DEFINER and can read custom.record directly — so it ` +
        `proves nothing about the product. Add \`set local role authenticated\` (or ` +
        `set_config('role','authenticated', true)) before the clauses you assert; ` +
        `scripts/campaign-tests/storet_green.sql PART 0 is the worked example.`,
    );
    const newest = bare.slice(-8);
    console.error(`       among them: ${newest.join(", ")}`);
    exitAfterDrain(1);
  }

  if (bare.length < BASELINE) {
    console.log(
      `[ OK ] campaign suites running as the superuser - ${bare.length}, below the baseline of ` +
        `${BASELINE}. LOWER THE BASELINE in this file to ${bare.length} so it cannot come back.`,
    );
    exitAfterDrain(0);
  }

  console.log(
    `[ OK ] campaign suites running as the superuser - ${bare.length}, exactly the baseline. ` +
      `No new one was added.`,
  );
  exitAfterDrain(0);
}

main();
