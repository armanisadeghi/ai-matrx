#!/usr/bin/env npx tsx
// Data crew C, path 2 (STORE DOORS): enter the FIFA World Cup finals dataset
// through signed-in supabase-js + @ai-matrx/records/core directly, with field
// types chosen deliberately (year=number, score/venue/location=text,
// attendance=number with thousands separators stripped, winner/runner_up=
// single-select choice fields built from the real set of countries that won
// or lost a final).
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

const LOG: Record<string, unknown>[] = [];
function limit(doing: string, said: string, expected: string) {
  const row = { when: new Date().toISOString(), crew: "C", use_case: "FIFA World Cup finals trivia night", doing, said, expected };
  LOG.push(row);
  console.log(`[LIMIT] ${doing} -> ${said}`);
}

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const userId = signedIn.data.user.id;
  console.log(`Signed in as admin, user id ${userId}`);

  const orgIds: Record<string, string> = JSON.parse(
    readFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), "utf8"),
  );
  const orgId = orgIds["fifa-world-cup-finals-trivia-night.json"];
  if (!orgId) throw new Error("no org id for the FIFA use case — run create-orgs-crew-c.ts first");

  const raw = JSON.parse(
    readFileSync(path.resolve(__dirname, "use-cases/fifa-world-cup-finals-trivia-night.json"), "utf8"),
  );
  const rows: Record<string, unknown>[] = raw.rows;

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(userId),
    organizationId: orgId,
  });

  const home = await store.personKernelId();
  if (!home.ok) { limit("personKernelId", home.data as unknown as string ?? JSON.stringify(home), "a home kernel id"); throw new Error("no home kernel"); }
  const homeRec = await store.recordWrite({ table_id: home.data, data: { name: "The Offside Rule home" } });
  if (!homeRec.ok) { limit("home record write", JSON.stringify(homeRec), "a home record to parent the table under"); throw new Error("no home record"); }
  const homeId = homeRec.data;
  console.log(`home -> ${homeId}`);

  const winners = Array.from(new Set(rows.map((r) => r.winner as string)));
  const runnerUps = Array.from(new Set(rows.map((r) => r.runner_up as string)));

  const fields = [
    { name: "year", label: "year", plain: "number" },
    { name: "host", label: "host", plain: "text" },
    { name: "winner", label: "winner", type: "select", options: winners },
    { name: "score", label: "score", type: "long_text" },
    { name: "runner_up", label: "runner_up", type: "select", options: runnerUps },
    { name: "venue", label: "venue", plain: "text" },
    { name: "location", label: "location", plain: "text" },
    { name: "attendance", label: "attendance", plain: "number" },
  ];

  const declared = await store.tableDeclare({
    spec: {
      name: "The Offside Rule: World Cup Finals",
      slug: `wc_finals_${Date.now().toString(36)}`,
      type: "entity",
      label_singular: "Final",
      label_plural: "Finals",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "sorted",
      retention_days: 3650,
      agent_writable: true,
      title_field: "year",
      default_sort: [{ field: "year", direction: "desc" }],
      fields,
    },
    homeId,
  });
  if (!declared.ok) {
    limit(`tableDeclare World Cup Finals (${fields.length} fields, incl. select+long_text+number)`, JSON.stringify(declared), "the table created with all declared field types");
    writeFileSync(path.resolve(__dirname, "entry-limits-crew-c-fifa.json"), JSON.stringify(LOG, null, 2));
    throw new Error("table declare failed");
  }
  const tableId = declared.data;
  console.log(`table -> ${tableId}`);

  let written = 0;
  for (const row of rows) {
    const attendanceNum = Number(String(row.attendance).replace(/,/g, ""));
    const data = {
      year: row.year,
      host: row.host,
      winner: row.winner,
      score: row.score,
      runner_up: row.runner_up,
      venue: row.venue,
      location: row.location,
      attendance: attendanceNum,
    };
    const w = await store.recordWrite({ table_id: tableId, data });
    if (!w.ok) {
      limit(`recordWrite final ${row.year}`, JSON.stringify(w), "the row saved with the number/select/long_text types as declared");
      continue;
    }
    written += 1;
  }
  console.log(`wrote ${written}/${rows.length} rows`);

  writeFileSync(
    path.resolve(__dirname, "entry-results-crew-c-fifa.json"),
    JSON.stringify({ orgId, homeId, tableId, written, total: rows.length }, null, 2),
  );
  writeFileSync(path.resolve(__dirname, "entry-limits-crew-c-fifa.json"), JSON.stringify(LOG, null, 2));
  console.log(`Done. ${LOG.length} limitations recorded.`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
