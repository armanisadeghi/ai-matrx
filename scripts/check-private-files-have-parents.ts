/**
 * EVERY FILE OF A PRIVATE OR CONFIDENTIAL RECORD IS THAT RECORD'S CHILD.
 *
 * The law: common-docs/policies/access-ladder.md ("Children inherit their parent"). Since "personal"
 * stopped locking on Organization tables (T-11j), a files.files row with no parent record is open to
 * its owner's coworkers — so an AI-chat attachment, a study-session recording or a browser-profile
 * login capture left parentless is a live leak. Every writer stamps the parent at write time
 * (migration access_ladder_t13a_private_record_files_are_children.sql); this guard is the census that
 * proves none slipped through.
 *
 * The check is ONE database query, `files.private_children_missing_parent()`, one row per:
 *   · a file a Private/Confidential link names (HR and other `_adopt_files_named_by_row` tables,
 *     browser.capture, login-capture paths, DM media, AI-chat messages / tool output / variables)
 *     that has no parent record;
 *   · a derived file whose source belongs to a record but which does not;
 *   · a missing or disabled adopter trigger; a missing file parent type.
 *
 * ZERO ROWS OR IT FAILED. No allow-list, no baseline. UNMEASURED IS NOT PASSED.
 *
 * THE SELF-TEST plants each violation for real inside a transaction that is always rolled back and
 * requires the named check to go red, then requires the clean database to be green again.
 *
 *   pnpm check:private-files-have-parents
 *   pnpm check:private-files-have-parents:self-test
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const GUARD = `select check_name, file_id::text, parent_type, parent_id::text
                 from files.private_children_missing_parent()`;

interface Row {
  check_name: string;
  file_id: string | null;
  parent_type: string | null;
  parent_id: string | null;
}

const PLANTS: ReadonlyArray<{ name: string; expect: string; sql: string }> = [
  {
    name: "a study-session recording loses its parent",
    expect: "record_file_without_parent:education.study_session.session_audio_file_id",
    sql: `update files.files f set parent_record_type = null, parent_record_id = null
            where f.id = (select s.session_audio_file_id from education.study_session s
                            join files.files x on x.id = s.session_audio_file_id
                           where x.parent_record_type = 'study_session' limit 1)`,
  },
  {
    name: "a login capture loses its parent",
    expect: "login_capture_without_parent",
    sql: `update files.files f set parent_record_type = null, parent_record_id = null
            where f.id = (select c.file_id from browser.capture c
                            join files.files x on x.id = c.file_id
                           where x.parent_record_type = 'browser_profile' limit 1)`,
  },
  {
    name: "the browser-capture adopter is disabled",
    expect: "adopter_missing_or_disabled:browser.capture._adopt_browser_capture_file",
    sql: `alter table browser.capture disable trigger _adopt_browser_capture_file`,
  },
  {
    name: "browser_profile leaves the file parent list",
    expect: "parent_type_missing",
    sql: `do $d$ begin execute replace(pg_get_functiondef('platform.child_parent_types(text)'::regprocedure),
            $q$'dm_conversation', 'study_session', 'browser_profile'$q$,
            $q$'dm_conversation', 'study_session'$q$); end $d$`,
  },
];

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if (!("host" in env)) {
    fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  }
  const client = await connectDirect(env, "check-private-files-have-parents").catch(
    (error: unknown) => {
      fail(`UNMEASURED: could not reach the database — ${String(error)}`);
    },
  );

  try {
    if (selfTest) {
      for (const plant of PLANTS) {
        await client.query("begin");
        try {
          await client.query("set local lock_timeout = '2s'");
          const planted = await client.query(plant.sql);
          if (plant.sql.trimStart().startsWith("update") && planted.rowCount !== 1) {
            fail(`SELF-TEST FAILED — "${plant.name}" planted ${planted.rowCount} rows, expected 1.`);
          }
          const rows = (await client.query<Row>(GUARD)).rows;
          if (!rows.some((r) => r.check_name === plant.expect)) {
            fail(
              `SELF-TEST FAILED — planted "${plant.name}" and the guard did not report ${plant.expect} ` +
                `(it answered: ${[...new Set(rows.map((r) => r.check_name))].join(", ") || "nothing"}).`,
            );
          }
          console.log(`[ OK ] RED as expected — ${plant.name} -> ${plant.expect}`);
        } finally {
          await client.query("rollback");
        }
      }
      const clean = (await client.query<Row>(GUARD)).rows;
      if (clean.length > 0) {
        fail(`SELF-TEST FAILED — after every rollback the live database is not green: ${clean.map((r) => r.check_name).join(", ")}`);
      }
      console.log(`[ OK ] self-test — ${PLANTS.length} planted violations each went RED for their named reason; the rolled-back database is GREEN.`);
      return;
    }

    const rows = (await client.query<Row>(GUARD)).rows;
    if (rows.length > 0) {
      fail(
        `${rows.length} file(s) of a Private or Confidential record are open to coworkers or unguarded:\n` +
          rows
            .slice(0, 50)
            .map((r) => `  - ${r.check_name}: file ${r.file_id ?? "-"} -> ${r.parent_type ?? "-"} ${r.parent_id ?? ""}`)
            .join("\n") +
          "\n  A file of a Private/Confidential record must name it as parent (parent_record_type/parent_record_id); " +
          "fix the writer that made it (common-docs/policies/access-ladder.md, T-13 2.1).",
      );
    }
    console.log("✅ PRIVATE FILES HAVE PARENTS: every file a Private or Confidential record names is its child, and every adopter is live.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
