// FIX-10B (VERIFIER-10 F3) — archive a table in resumable chunks, from a real seat.
//
// Drives `custom.table_archive` exactly as the screen does: one call per chunk, the numbers
// it answers with printed as the progress a person would see, and a resume proof — the run is
// deliberately interrupted and restarted, and it picks up where it stopped.
//
//   node scripts/fix10b/archive-table-in-chunks.mjs <organization_id> <table_id> [chunk] [--keep-table] [--report-only] [--cut-after N]
//
// Signed in as admin@admin.com through the client door; never prints a secret.
import { formatDurationMs } from "@ai-matrx/kit/format";
import { signedInClient } from "../campaign-tests/use-cases/_client.mjs";

const [org, table, chunkArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const chunk = Number(chunkArg ?? 200);
const keepTable = flags.includes("--keep-table");
const reportOnly = flags.includes("--report-only");
const cutAfter = Number((flags.find((f) => f.startsWith("--cut-after=")) ?? "").split("=")[1] ?? 0);

if (!org || !table) {
  console.error("usage: archive-table-in-chunks.mjs <organization_id> <table_id> [chunk] [--keep-table] [--report-only] [--cut-after=N]");
  process.exit(2);
}

const { client } = await signedInClient();

async function pass(size) {
  const { data, error } = await client.schema("custom").rpc("table_archive", {
    p_organization_id: org,
    p_table_id: table,
    p_chunk: size,
    p_include_table: !keepTable,
  });
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`.trim());
  return data;
}

const started = Date.now();
let first = await pass(0);
console.log(`before: ${first.message}`);
console.log(`        remaining ${first.remaining} · already archived ${first.archived_total} · total ${first.total}`);
if (reportOnly) process.exit(0);

let passes = 0;
let last = first;
while (!last.done) {
  last = await pass(chunk);
  passes += 1;
  const pct = last.total ? Math.round(((last.total - last.remaining) / last.total) * 100) : 100;
  console.log(`pass ${String(passes).padStart(2)} · ${String(pct).padStart(3)}% · ${last.message}`);
  if (cutAfter && passes === cutAfter) {
    console.log(`--- CUT: stopping mid-run after pass ${passes}, ${last.remaining} still live. Run again to resume.`);
    process.exit(0);
  }
}
console.log(`done in ${passes} pass${passes === 1 ? "" : "es"}, ${formatDurationMs(Date.now() - started, { style: "compact" })} · remaining ${last.remaining} · archived in total ${last.archived_total} · table archived: ${last.table_archived}`);
