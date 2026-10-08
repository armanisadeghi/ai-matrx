// features/spaces/data/table-to-database.ts — C14: a simple table's ••• "Turn into database" (Notion).
//
// A NEW real table in the page's organization: the first column is the title property (its header, else
// "Name"), every other column a text property named by its header (else "Column 2", …); each body row
// becomes a record, written in one call (`recordWriteMany`). The page owns the table (`page_database`).

import { createRecordsClient, declareTable, supabaseDataSource, tokenFor } from "@ai-matrx/records/core";

import { createClient } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import { pageOrganizationId } from "./agency-install";
import { adoptPageDatabase } from "./new-database";
import type { PickedSource } from "./SourcePicker";

export interface SimpleTable {
  rows: string[][];
  headerRow: boolean;
}

/** The properties and records a simple table becomes (pure: tested). */
export function planTableDatabase(t: SimpleTable): { fields: Array<{ key: string; label: string; type: "text"; sort: number; required: false }>; records: Array<Record<string, string>> } {
  const width = Math.max(1, ...t.rows.map((r) => r.length));
  const head = t.headerRow ? (t.rows[0] ?? []) : [];
  const body = (t.headerRow ? t.rows.slice(1) : t.rows).filter((r) => r.some((c) => c.trim()));
  const used = new Set<string>();
  const fields = Array.from({ length: width }, (_, i) => {
    const label = (head[i] ?? "").trim() || (i === 0 ? "Name" : `Column ${i + 1}`);
    let key = i === 0 ? "name" : tokenFor(label) || `column_${i + 1}`;
    while (used.has(key)) key = `${key}_${i + 1}`;
    used.add(key);
    return { key, label, type: "text" as const, sort: (i + 1) * 10, required: false as const };
  });
  const records = body.map((r) => Object.fromEntries(fields.map((f, i) => [f.key, (r[i] ?? "").trim()]).filter(([, v]) => v)));
  return { fields, records };
}

export async function tableToDatabase(spaceId: string, userId: string | null, t: SimpleTable, name = "Untitled database"): Promise<PickedSource> {
  const organizationId = (await pageOrganizationId(spaceId)) ?? (await ensureOrgId(null));
  const client = createRecordsClient({
    dataSource: supabaseDataSource(createClient()),
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    organizationId,
  });
  const plan = planTableDatabase(t);
  const made = await declareTable(client, { name, slug: `${tokenFor(name)}_${Date.now().toString(36)}`, titleField: "name", fields: plan.fields });
  if (!made.ok) throw new Error(made.error.message || "The database could not be made.");
  if (plan.records.length) {
    const wrote = await client.recordWriteMany({ table_id: made.data, rows: plan.records });
    if (!wrote.ok) throw new Error(`The database was made, but its rows were not written: ${wrote.error.message}`);
  }
  await adoptPageDatabase(spaceId, made.data);
  return { tableId: made.data, name };
}
