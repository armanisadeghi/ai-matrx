#!/usr/bin/env npx tsx
/**
 * Data crew D — enter three real-data use cases through the live doors as
 * admin@admin.com. NOT committed (throwaway entry script; the JSON templates
 * beside it are the committed deliverable).
 *
 * Heuristic field typing (real field kinds exercised across the whole run):
 *   key contains bio/notes/description/summary/hypothesis/event/task/show_notes -> long_text
 *   key contains url/website/linkedin/orcid                                    -> url
 *   key contains date (but not "update")                                      -> date
 *   key === status or ends with _status                                       -> choice (options = distinct values seen)
 *   everything else                                                           -> plain text/number
 *
 * A dedicated "Field Kinds Gallery" table (declared under the podcast org)
 * additionally exercises multi_choice, person and relation+rollup explicitly,
 * since no dataset column naturally needs them.
 *
 * Usage: node node_modules/tsx/dist/cli.mjs scripts/campaign-tests/enter-real-data-crew-d.ts
 */
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
function limit(useCase: string, doing: string, said: string, expected: string) {
  const row = { when: new Date().toISOString(), crew: "D", use_case: useCase, doing, said, expected };
  LOG.push(row);
  console.log(`[LIMIT] ${useCase} :: ${doing} -> ${said}`);
}

function fieldSpecFor(key: string, values: unknown[]): Record<string, unknown> {
  const k = key.toLowerCase();
  if (/(bio|notes|description|summary|hypothesis|^event$|task)/.test(k)) {
    return { name: key, label: key, key, type: "long_text", plain: "long_text" };
  }
  if (/(url|website|linkedin|orcid)/.test(k)) {
    return { name: key, label: key, key, type: "url" };
  }
  if (/date/.test(k)) {
    return { name: key, label: key, key, type: "datetime", kind: "date" };
  }
  if (k === "status" || k.endsWith("_status")) {
    const options = Array.from(new Set(values.filter((v) => typeof v === "string" && v !== "") as string[]));
    return { name: key, label: key, key, type: "select", options: options.length ? options : ["Open"] };
  }
  if (typeof values.find((v) => v !== undefined && v !== null) === "number") {
    return { name: key, label: key, key, type: "number" };
  }
  return { name: key, label: key, key, plain: "text" };
}

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const userId = signedIn.data.user.id;
  console.log(`Signed in as admin, user id ${userId}`);

  const files = [
    "podcast-episode-pipeline.json",
    "research-lab-experiment-log.json",
    "museum-collection-catalog.json",
  ];

  const orgIdsPath = path.resolve(__dirname, "org-ids.json");
  const orgIdsByFile: Record<string, string> = JSON.parse(readFileSync(orgIdsPath, "utf8"));

  const results: Record<string, unknown> = {};

  for (const file of files) {
    const raw = JSON.parse(readFileSync(path.resolve(__dirname, "use-cases", file), "utf8"));
    const useCase: string = raw.use_case;
    const orgName: string = raw.organization_name;
    console.log(`\n=== ${orgName} ===`);

    const orgId = orgIdsByFile[file];
    if (!orgId) { limit(useCase, "org lookup", `no pre-created org id for ${file}`, "an existing organization id"); continue; }
    console.log(`using pre-created org: ${orgId}`);

    const store: RecordsClient = createRecordsClient({
      dataSource: recordsDataSource(supabase),
      actor: personActor(userId),
      organizationId: orgId,
    });

    const home = await store.personKernelId();
    if (!home.ok) { limit(useCase, "personKernelId", home.error.message, "a home kernel id"); continue; }
    const homeRec = await store.recordWrite({ table_id: home.data, data: { name: `${orgName} home` } });
    if (!homeRec.ok) { limit(useCase, "home record write", homeRec.error.message, "a home record to parent tables under"); continue; }
    const homeId = homeRec.data;

    const tableIds: Record<string, string> = {};
    const rowIdsByTitle: Record<string, Record<string, string>> = {}; // tableName -> (title/name field value) -> recordId
    const rowCounts: Record<string, number> = {};

    for (const [tableName, rowsRaw] of Object.entries(raw.tables as Record<string, any[]>)) {
      const rows = rowsRaw as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const titleKeyEarly = keys.find((k) => /title|name/i.test(k)) ?? keys[0];
      const fields = keys.map((k) => {
        const spec = fieldSpecFor(k, rows.map((r) => r[k]));
        const { key, ...rest } = spec;
        return rest; // fields[] in tableDeclare spec takes bare declarations; key derives from label
      });
      const declared = await store.tableDeclare({
        spec: {
          name: `${orgName}: ${tableName}`,
          slug: `${tableName}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          type: "entity",
          label_singular: tableName,
          label_plural: tableName,
          display: "list",
          weight: "light",
          ordered: false,
          row_order: "sorted",
          agent_writable: true,
          retention_days: 3650,
          title_field: titleKeyEarly,
          default_sort: [{ field: titleKeyEarly, direction: "asc" }],
          fields,
        },
        homeId,
      });
      if (!declared.ok) {
        limit(useCase, `tableDeclare ${tableName} (${keys.length} fields)`, declared.error.message, "the table to be created with all its declared fields");
        continue;
      }
      tableIds[tableName] = declared.data;
      rowIdsByTitle[tableName] = {};
      console.log(`  table ${tableName} -> ${declared.data} (${keys.length} fields declared, ${rows.length} rows to write)`);

      // Write rows sequentially (recordWrite has no batch door in this package).
      let written = 0;
      const titleKey = keys.find((k) => /title|name/i.test(k)) ?? keys[0];
      for (const row of rows) {
        const w = await store.recordWrite({ table_id: declared.data, data: row });
        if (!w.ok) {
          limit(useCase, `recordWrite ${tableName} row (${String(row[titleKey])})`, w.error.message, "the row to be saved");
          continue;
        }
        written += 1;
        const titleVal = row[titleKey];
        if (typeof titleVal === "string") rowIdsByTitle[tableName][titleVal] = w.data;
      }
      rowCounts[tableName] = written;
      console.log(`    wrote ${written}/${rows.length} rows`);
    }

    results[orgName] = { orgId, tableIds, rowCounts };
    writeFileSync(path.resolve(__dirname, "entry-results.json"), JSON.stringify(results, null, 2));

    // ---- Field Kinds Gallery: multi_choice, person, relation, rollup, under the podcast org ----
    if (orgName.includes("Signal & Scale") && tableIds["guests"] && tableIds["episodes"]) {
      console.log("  -- field kinds gallery --");
      const galleryFields = [
        { name: "name", label: "name", plain: "text" },
        { name: "topics", label: "topics", type: "multi_select", options: ["Platform", "Security", "Cost", "Data", "Growth", "Culture"] },
        { name: "producer", label: "producer", type: "member" },
        { name: "featured_guest", label: "featured_guest", type: "relation", relation_target: tableIds["guests"] },
      ];
      const galleryDeclared = await store.tableDeclare({
        spec: {
          name: `${orgName}: Field Kinds Gallery`,
          slug: `field_kinds_gallery_${Date.now().toString(36)}`,
          type: "entity",
          label_singular: "Gallery Row",
          label_plural: "Gallery Rows",
          display: "list",
          weight: "light",
          ordered: false,
          row_order: "sorted",
          agent_writable: true,
          retention_days: 3650,
          title_field: "name",
          default_sort: [{ field: "name", direction: "asc" }],
          fields: galleryFields,
        },
        homeId,
      });
      if (!galleryDeclared.ok) {
        limit(useCase, "tableDeclare Field Kinds Gallery (multi_select/member/relation)", galleryDeclared.error.message, "a table declaring multi_select, member and relation fields");
      } else {
        console.log(`  gallery table -> ${galleryDeclared.data}`);
        const firstGuestId = Object.values(rowIdsByTitle["guests"] ?? {})[0];
        const galleryRow = await store.recordWrite({
          table_id: galleryDeclared.data,
          data: {
            name: "Q3 flagship episode",
            topics: ["Platform", "Culture"],
            producer: userId,
            featured_guest: firstGuestId,
          },
        });
        if (!galleryRow.ok) {
          limit(useCase, "recordWrite gallery row (multi_select+member+relation values)", galleryRow.error.message, "a row combining multi_select, member and relation values");
        } else {
          console.log(`  gallery row -> ${galleryRow.data}`);
        }

        // Rollup: sponsors.episode_count counting episodes via their sponsor relation.
        const sponsorEpisodeField = { label: "episode_count", type: "rollup", via: "sponsor", agg: "count" };
        const rollupDeclared = await store.fieldDeclare({
          table_id: tableIds["sponsors"],
          spec: sponsorEpisodeField as any,
        });
        if (!rollupDeclared.ok) {
          limit(useCase, "fieldDeclare rollup (sponsors.episode_count via episodes.sponsor)", rollupDeclared.error.message, "a rollup column counting related episodes per sponsor");
        } else {
          console.log(`  rollup field -> ${rollupDeclared.data}`);
        }
      }
    }
  }

  writeFileSync(path.resolve(__dirname, "entry-limits.json"), JSON.stringify(LOG, null, 2));
  console.log(`\nDone. ${LOG.length} limitations recorded. See entry-results.json and entry-limits.json`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
