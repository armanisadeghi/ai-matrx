/**
 * NO SCREEN GETS RID OF A WHOLE TABLE IN ONE UNBOUNDED CALL.
 *
 * WHAT THIS CLOSES — VERIFIER-11 F3, reproduced on the main database on 2026-09-22.
 * An admin of Greenline Landscaping Crew opened Settings on "Riverside Yard season
 * tickets" (1,430 records the product's own import had just written), pressed
 * **Delete this table** and confirmed. Twelve seconds later:
 *
 *     That took too long to answer
 *     canceling statement due to statement timeout
 *     Nothing was changed. Try a smaller page, or try again in a moment.   57014
 *
 * There is no page. The screen was calling `custom.record_delete` with the TABLE's id —
 * the store's one soft-delete door, which is right for a record and, aimed at a Table,
 * recurses through every record the Table contains inside ONE transaction: a delete
 * rule, an access check, a history capture and an outbox row per record, in a single
 * statement. That is unbounded BY CONSTRUCTION. There is no number of records at which
 * it starts working again, so raising the timeout only moves the wall, and the advice
 * the person was given — "try a smaller page" — means nothing when what you are doing is
 * getting rid of a table.
 *
 * THE RULE THIS ENFORCES. A store whose WRITE path is batched and whose DELETE path is
 * not has one honest shape available to it: **archiving a table is a job, not a
 * statement.** So client code archives a table through `custom.table_archive` —
 * `client.tableArchive()` / `useTableArchive()` in `@ai-matrx/records` — which takes at
 * most `chunk` records per call, answers with `archived / remaining / total / done`, and
 * is resumable because it is stateless. The caller LOOPS. That loop is the fix.
 *
 * WHAT COUNTS AS AN OFFENCE. Client code (a screen, a hook, a service — not a migration,
 * not a one-off script) that hands a TABLE's id to the single-record soft-delete door:
 *
 *     mutation.remove({ record_id: tableId })
 *     client.recordDelete({ record_id: table.id })
 *     supabase.schema("custom").rpc("record_delete", { p_record_id: tableId })
 *
 * The target is read off the argument itself: a name that says `table` is a table, and a
 * name that says `record` is a record. Deleting ONE record through that door is exactly
 * what it is for and is never flagged.
 *
 *   pnpm check:table-archive-is-chunked
 *   pnpm check:table-archive-is-chunked:self-test   # proves it can still go RED
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative, resolve } from "path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = join(__dirname, "..");

/**
 * WHERE CLIENT CODE LIVES. This repo's own screens, plus the two shared packages the
 * screens are built out of — `@ai-matrx/records-ui` is where the defect actually was, and
 * a guard in this repo that could not see it would have watched the wrong tree. The
 * packages are a sibling checkout: when it is not on this machine the guard SAYS so
 * rather than passing quietly on a census of nothing.
 */
const CLIENT_TREES = [
  join(ROOT, "app"),
  join(ROOT, "components"),
  join(ROOT, "features"),
  join(ROOT, "hooks"),
  join(ROOT, "lib"),
  resolve(ROOT, "..", "aidream", "apps", "shared", "records", "src"),
  resolve(ROOT, "..", "aidream", "apps", "shared", "records-ui", "src"),
];

/**
 * THE SINGLE-RECORD SOFT-DELETE DOOR, called by any of its three names, with the object
 * argument that names what it is aimed at. The bounded `[\s\S]` windows keep a call
 * spanning a few formatted lines in range without letting a match run off into the next
 * function and pair a door with an argument that was never handed to it.
 */
const DELETE_CALL =
  /(recordDelete|\.remove|["'`]record_delete["'`])\s*(?:,\s*)?[\s\S]{0,200}?\{[\s\S]{0,300}?\b(?:record_id|recordId|p_record_id)\s*:\s*([A-Za-z0-9_$.?\[\]"'`]+)/g;

/** A name that says table IS a table. `tableId`, `table.id`, `p_table_id`, `tableRecordId`. */
const NAMES_A_TABLE = /table/i;

/**
 * TAKING BACK A TABLE YOU JUST MADE IS NOT GETTING RID OF A TABLE.
 *
 * `createTable.ts` and `systemTable.ts` both declare a Table and then, when the NEXT
 * door refuses, put it back so a half-made table is not left standing beside a red
 * sentence. The table they delete is seconds old and holds ZERO records, so the recursion
 * this guard exists to stop has nothing to recurse through — it is bounded by the fact
 * that nothing has been written into it yet. Chunking it would add a loop that always
 * runs exactly once.
 *
 * The exemption is deliberately narrow: the SAME code must have declared the table, close
 * enough above the delete to read as one act. A delete of a table this file did not make
 * is the defect, however it is spelled.
 */
const DECLARES_THE_TABLE_ITSELF = /tableDeclare\s*\(|["'`]table_declare["'`]/;
const ROLLBACK_WINDOW = 60;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

export function offences(trees: string[] = CLIENT_TREES): string[] {
  const bad: string[] = [];
  for (const tree of trees) {
    if (!existsSync(tree)) continue;
    for (const file of walk(tree)) {
      if (file.includes("check-table-archive-is-chunked")) continue;
      const body = readFileSync(file, "utf8");
      const lines = body.split("\n");
      DELETE_CALL.lastIndex = 0;
      let hit: RegExpExecArray | null;
      while ((hit = DELETE_CALL.exec(body)) !== null) {
        const target = hit[2] ?? "";
        if (!NAMES_A_TABLE.test(target)) continue;
        const line = body.slice(0, hit.index).split("\n").length;
        // A COMMENT DESCRIBING THE DEFECT IS NOT THE DEFECT. The fixed screen keeps the
        // story of what it used to do, in its own words, above the code that replaced it.
        const text = lines[line - 1] ?? "";
        if (/^\s*(\*|\/\/|--)/.test(text)) continue;
        // A rollback of a table this same code just declared — see above.
        const above = lines.slice(Math.max(0, line - 1 - ROLLBACK_WINDOW), line - 1).join("\n");
        if (DECLARES_THE_TABLE_ITSELF.test(above)) continue;
        const rel = relative(ROOT, file);
        bad.push(
          `${rel}:${line} — hands a TABLE's id (${target}) to the single-record soft-delete door \`${hit[1]}\`. That call recurses through every record the table holds inside one transaction and dies on 57014 at a size the product's own import reaches in half a minute, changing nothing. Archive it in passes instead: \`useTableArchive(tableId)\` / \`client.tableArchive({ table_id, chunk })\`, looped until \`done\`.`,
        );
      }
    }
  }
  return bad.sort();
}

function main() {
  if (process.argv.includes("--self-test")) {
    // A FORCING-FUNCTION SELF-TEST. Four planted files: the screen that shipped the
    // defect, the screen that replaced it, an ordinary delete of ONE record, and a
    // creation that rolls itself back. The census must see the first and none of the
    // other three, or it cannot tell a table from a record, or a table full of somebody's
    // work from one that is seconds old and empty, and is worth nothing on the real tree.
    const dir = mkdtempSync(join(tmpdir(), "table-archive-chunked-selftest-"));
    writeFileSync(
      join(dir, "SettingsThatDeletedTheTable.tsx"),
      [
        'import { useRecordMutation } from "@ai-matrx/records/react";',
        "export function Panel({ tableId }) {",
        "  const mutation = useRecordMutation();",
        "  const deleteTable = async () => {",
        "    const gone = await mutation.remove({ record_id: tableId });",
        "    if (gone !== null) onDeleted?.();",
        "  };",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "SettingsThatArchivesInChunks.tsx"),
      [
        'import { useTableArchive } from "@ai-matrx/records/react";',
        "export function Panel({ tableId }) {",
        "  const archive = useTableArchive(tableId, { chunk: 200 });",
        "  const startArchive = async () => {",
        "    const finished = await archive.start();",
        "    if (finished?.done && finished.table_archived) onDeleted?.();",
        "  };",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "RowMenuThatDeletesOneRecord.tsx"),
      [
        'import { useRecordMutation } from "@ai-matrx/records/react";',
        "export function RowMenu({ record }) {",
        "  const mutation = useRecordMutation();",
        "  return <button onClick={() => mutation.remove({ record_id: record.id })}>Archive</button>;",
        "}",
      ].join("\n"),
    );

    writeFileSync(
      join(dir, "createTableThatRollsItselfBack.ts"),
      [
        "async function declareTable(client, spec) {",
        "  const table = await client.tableDeclare({ spec });",
        "  const written = await client.fieldDeclare({ table_id: table.data, spec: spec.fields[0] });",
        "  if (!written.ok) {",
        "    // the table is seconds old and holds no records at all",
        "    await client.recordDelete({ record_id: table.data });",
        "    return written;",
        "  }",
        "  return table;",
        "}",
      ].join("\n"),
    );

    const seen = offences([dir]);
    const red = seen.filter((l) => l.includes("SettingsThatDeletedTheTable"));
    const wrong = seen.filter((l) => !l.includes("SettingsThatDeletedTheTable"));
    if (red.length !== 1) {
      console.error(
        `[FAIL] self-test: the census did NOT flag the screen that deletes a whole table in one call. It saw ${seen.length} thing(s) in ${dir}. This guard cannot go red, so it proves nothing.`,
      );
      exitAfterDrain(1);
    }
    if (wrong.length !== 0) {
      console.error(
        `[FAIL] self-test: the census flagged code that is correct — ${wrong.join("; ")}. A guard that refuses the chunked door, or an ordinary one-record delete, teaches people to switch it off.`,
      );
      exitAfterDrain(1);
    }
    console.log(
      `[OK] self-test: RED on the screen that deleted a whole table in one call, GREEN on the chunked replacement, a one-record delete and a creation that rolls itself back (fixtures in ${dir}). The guard can still fail.`,
    );
    exitAfterDrain(0);
  }

  const missing = CLIENT_TREES.filter((t) => !existsSync(t));
  const bad = offences();
  if (bad.length > 0) {
    console.error("[FAIL] client code gets rid of a whole table in one unbounded call:");
    for (const line of bad) console.error("  - " + line);
    exitAfterDrain(1);
  }
  for (const tree of missing) {
    console.warn(
      `[WARN] not on this machine, so nothing in it was checked: ${tree}. The record packages are a sibling checkout of this repo.`,
    );
  }
  console.log(
    `[OK] every screen that gets rid of a whole table archives it in resumable passes through custom.table_archive. ${CLIENT_TREES.length - missing.length} tree(s) read.`,
  );
}

if (require.main === module) main();
