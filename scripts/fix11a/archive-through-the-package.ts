/**
 * FIX-11A (VERIFIER-11 F3) — the screen's OWN call sequence, driven from a real seat.
 *
 * This is not a re-implementation of the fix: it builds `@ai-matrx/records` exactly as a
 * host does, calls the door through the package's new `client.tableArchive(...)`, and
 * makes the same pass-by-pass loop `useTableArchive` makes — so what is proven here is
 * the code the Settings panel runs, not a script that resembles it.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/fix11a/archive-through-the-package.ts \
 *     <organization_id> <table_id> [chunk=50] [--report-only] [--keep-table] [--cut-after=N]
 *
 * Signed in as admin@admin.com through the client door. Never prints a secret.
 */
import { createRecordsClient } from "../../../aidream/apps/shared/records/src/core/client";
import { supabaseDataSource } from "../../../aidream/apps/shared/records/src/core/supabase";
// @ts-expect-error — the shared sign-in helper is plain ESM with no types.
import { signedInClient } from "../campaign-tests/use-cases/_client.mjs";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [org, tableId, chunkArg] = positional;
const chunk = Number(chunkArg ?? 50);
const reportOnly = flags.includes("--report-only");
const keepTable = flags.includes("--keep-table");
const cutAfter = Number((flags.find((f) => f.startsWith("--cut-after=")) ?? "").split("=")[1] ?? 0);

if (!org || !tableId) {
  console.error("usage: archive-through-the-package.ts <organization_id> <table_id> [chunk=50] [--report-only] [--keep-table] [--cut-after=N]");
  process.exit(2);
}

async function main() {
  const { client: supabase, userId } = await signedInClient();
  const records = createRecordsClient({
    dataSource: supabaseDataSource(supabase),
    actor: { userId },
    organizationId: org as string,
  });

  // THE PREVIEW THE CONFIRM PANEL MAKES: chunk 0 changes nothing and answers how much
  // there is, which is where the sentence "1,430 records will be archived" comes from.
  const before = await records.tableArchive({ table_id: tableId as string, chunk: 0, includeTable: !keepTable });
  if (!before.ok) {
    console.error(`preview refused: ${before.error.code} — ${before.error.message}`);
    process.exit(1);
  }
  console.log(`before · remaining ${before.data.remaining} · already archived ${before.data.archived_total} · total ${before.data.total}`);
  console.log(`        ${before.data.message}`);
  if (reportOnly) return;

  const started = Date.now();
  let passes = 0;
  let last = before.data;
  // The same back-off `useTableArchive` makes: a timeout is the one refusal that
  // is about SIZE, and a pass that timed out changed nothing, so retrying it
  // smaller repeats no work.
  let size = chunk;
  for (;;) {
    const answered = await records.tableArchive({ table_id: tableId as string, chunk: size, includeTable: !keepTable });
    if (!answered.ok) {
      if (answered.error.code === "timed_out" && size > 10) {
        size = Math.max(10, Math.floor(size / 2));
        console.log(`    the store ran out of time; taking smaller passes (${size})`);
        continue;
      }
      // WHAT THE SCREEN SAYS WHEN A PASS FAILS — never "nothing was changed".
      console.error(`pass ${passes + 1} refused: ${answered.error.code} — ${answered.error.message}`);
      console.error(`  ${last.archived_total} already archived, ${last.remaining} left. Run again to carry on.`);
      process.exit(1);
    }
    passes += 1;
    last = answered.data;
    const put = last.total - last.remaining;
    console.log(
      `pass ${String(passes).padStart(2)} · ${put} of ${last.total} put away so far · this pass ${last.archived} · remaining ${last.remaining}`,
    );
    if (last.done) break;
    if (cutAfter && passes === cutAfter) {
      console.log(`--- CUT mid-run after pass ${passes}: ${last.remaining} still live. Nothing was lost; run again to resume.`);
      return;
    }
  }
  console.log(
    `done in ${passes} pass${passes === 1 ? "" : "es"}, ${((Date.now() - started) / 1000).toFixed(1)}s · remaining ${last.remaining} · archived in total ${last.archived_total} · table archived: ${last.table_archived}`,
  );
}

void main();
