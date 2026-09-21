#!/usr/bin/env npx tsx
// Data crew C: finish the airports table left over from the headless-UI pass
// (created correctly via the UI, but the UI's "Add field" silently failed to
// persist columns — see REAL-DATA-LIMITS.md). Declares the real fields via
// the same fieldDeclare door proven to work on the FIFA table, then writes
// all 50 real airports so the organization is left with a genuinely usable,
// fully populated table rather than 8 blank rows.
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

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
  const orgId = orgIds["us-large-airports-relocation-route-planning.json"];
  const tableId = "b1ff92ea-977a-4af8-aa35-4d637de98019"; // created via headless UI "New table"
  const dataset = JSON.parse(readFileSync(path.resolve(__dirname, "use-cases/us-large-airports-relocation-route-planning.json"), "utf8"));

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(signedIn.data.user.id),
    organizationId: orgId,
  });

  const fieldSpecs = [
    { label: "name", plain: "text" },
    { label: "iata_code", plain: "text" },
    { label: "icao_code", plain: "text" },
    { label: "municipality", plain: "text" },
    { label: "state", plain: "text" },
    { label: "latitude_deg", plain: "number" },
    { label: "longitude_deg", plain: "number" },
    { label: "elevation_ft", plain: "number" },
    { label: "wikipedia_link", type: "url" },
  ];
  for (const spec of fieldSpecs) {
    const r = await store.fieldDeclare({ table_id: tableId, spec: spec as any });
    console.log(spec.label, "->", JSON.stringify(r));
  }

  let written = 0;
  for (const a of dataset.rows) {
    const w = await store.recordWrite({
      table_id: tableId,
      data: {
        name: a.name,
        iata_code: a.iata_code,
        icao_code: a.icao_code,
        municipality: a.municipality,
        state: a.state,
        latitude_deg: Number(a.latitude_deg),
        longitude_deg: Number(a.longitude_deg),
        elevation_ft: Number(a.elevation_ft),
        wikipedia_link: a.wikipedia_link,
      },
    });
    if (w.ok) written += 1;
    else console.log("row failed:", a.name, JSON.stringify(w));
  }
  console.log(`wrote ${written}/${dataset.rows.length} airport rows`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
