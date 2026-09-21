#!/usr/bin/env npx tsx
// Data crew C, path 1 (IMPORT WIZARD) setup: declare an empty target table
// for the National Parks CSV so the import wizard has somewhere to land.
import path from "node:path";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const userId = signedIn.data.user.id;

  const orgIds: Record<string, string> = JSON.parse(
    require("node:fs").readFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), "utf8"),
  );
  const orgId = orgIds["us-national-parks-park-itineraries.json"];
  if (!orgId) throw new Error("no org id for the parks use case");

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(userId),
    organizationId: orgId,
  });

  const home = await store.personKernelId();
  if (!home.ok) throw new Error(`personKernelId failed: ${JSON.stringify(home)}`);
  const homeRec = await store.recordWrite({ table_id: home.data, data: { name: "Trailhead & Torch Journeys home" } });
  if (!homeRec.ok) throw new Error(`home record write failed: ${JSON.stringify(homeRec)}`);
  const homeId = homeRec.data;

  const declared = await store.tableDeclare({
    spec: {
      name: "Trailhead & Torch Journeys: US National Parks",
      slug: `us_national_parks_${Date.now().toString(36)}`,
      type: "entity",
      label_singular: "Park",
      label_plural: "Parks",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "sorted",
      retention_days: 3650,
      agent_writable: true,
      title_field: "name",
      default_sort: [{ field: "name", direction: "asc" }],
      fields: [{ name: "name", label: "name", plain: "text" }],
    },
    homeId,
  });
  if (!declared.ok) throw new Error(`tableDeclare failed: ${JSON.stringify(declared)}`);
  console.log(`org ${orgId} home ${homeId} table ${declared.data}`);
  writeFileSync(
    path.resolve(__dirname, "parks-table-crew-c.json"),
    JSON.stringify({ orgId, homeId, tableId: declared.data }, null, 2),
  );
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
