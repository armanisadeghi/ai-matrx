#!/usr/bin/env npx tsx
// Data crew C: finish the National Parks table. The import-wizard pass (see
// REAL-DATA-LIMITS.md) proved and logged the real defect (51 empty rows,
// zero columns). This script declares the real fields via the door proven
// working on FIFA/airports and writes the 50 real parks with parsed values,
// so the organization is left with a genuinely usable table for review,
// alongside the untouched defect evidence already logged.
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

function parseArea(area: string): { acres: number | null; km2: number | null } {
  const acresMatch = area.match(/([\d,]+\.?\d*)\s*acres/);
  const km2Match = area.match(/\(([\d,]+\.?\d*)\s*km2\)/);
  return {
    acres: acresMatch ? Number(acresMatch[1].replace(/,/g, "")) : null,
    km2: km2Match ? Number(km2Match[1].replace(/,/g, "")) : null,
  };
}

async function main() {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  );
  const signedIn = await supabase.auth.signInWithPassword({
    email: process.env.AI_ADMIN_USERNAME as string,
    password: process.env.AI_ADMIN_PASSWORD as string,
  });
  if (signedIn.error || !signedIn.data.user) throw new Error("sign-in failed");

  const orgIds: Record<string, string> = JSON.parse(readFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), "utf8"));
  const orgId = orgIds["us-national-parks-park-itineraries.json"];
  const { tableId } = JSON.parse(readFileSync(path.resolve(__dirname, "parks-table-crew-c.json"), "utf8"));
  const dataset = JSON.parse(readFileSync(path.resolve(__dirname, "use-cases/us-national-parks-park-itineraries.json"), "utf8"));

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(signedIn.data.user.id),
    organizationId: orgId,
  });

  const fieldSpecs = [
    { label: "park_name", plain: "text" },
    { label: "state", plain: "text" },
    { label: "date_established", kind: "date" as const, type: "datetime" as const },
    { label: "area_acres", plain: "number" },
    { label: "area_km2", plain: "number" },
  ];
  for (const spec of fieldSpecs) {
    const r = await store.fieldDeclare({ table_id: tableId, spec: spec as any });
    console.log(spec.label, "->", JSON.stringify(r));
  }

  let written = 0;
  for (const row of dataset.rows as [string, string, string, string][]) {
    const [name, state, dateEstablished, area] = row;
    const { acres, km2 } = parseArea(area);
    const parsedDate = new Date(dateEstablished);
    const w = await store.recordWrite({
      table_id: tableId,
      data: {
        park_name: name,
        state,
        date_established: isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString().slice(0, 10),
        area_acres: acres,
        area_km2: km2,
      },
    });
    if (w.ok) written += 1;
    else console.log("row failed:", name, JSON.stringify(w));
  }
  console.log(`wrote ${written}/${(dataset.rows as unknown[]).length} park rows`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
