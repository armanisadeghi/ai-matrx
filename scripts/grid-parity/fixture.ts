/**
 * THE FIXTURE the before/after grid comparison stands on.
 *
 * One deterministic `/data` table owned by `admin@admin.com`, carrying every
 * shape the comparison has to judge: the twenty-five formats (one column per
 * family), a formula column, a choice column with option colours, a validation
 * rule, a colour-by, a live rule, a manual highlight, and rows whose values are
 * fixed so an assertion can name an exact cell.
 *
 * WHY A SEEDED TABLE AND NOT A SCREENSHOT OF HIS OWN DATA. A comparison whose
 * fixture changes between the two runs proves nothing: the old grid and the new
 * one have to be shown THE SAME rows. This script is idempotent — it finds the
 * table by name, and rebuilds its rows to the same values every time — so the
 * baseline run and the after run are answering about identical data.
 *
 * It signs in as the admin test identity from the environment and writes only
 * through the same RPCs the product uses. It never prints a credential.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/grid-parity/fixture.ts
 *   node node_modules/tsx/dist/cli.mjs scripts/grid-parity/fixture.ts --rows 120
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

export const FIXTURE_TABLE_NAME = "Grid Parity Fixture";

/** Where the harness reads the fixture's identity from. */
export const FIXTURE_HANDLE_PATH = resolve(
  process.cwd(),
  "scripts/grid-parity/.fixture.json",
);

type FieldSpec = {
  field_name: string;
  display_name: string;
  data_type: "string" | "number" | "integer" | "boolean" | "date" | "datetime" | "json" | "array";
  is_required?: boolean;
  /** `udt_dataset_fields.metadata.format` */
  format?: Record<string, unknown> | null;
  /** `udt_dataset_fields.validation_rules` */
  validation?: Record<string, unknown> | null;
};

/**
 * The columns. Every format FAMILY in the registry is represented: text,
 * long_text, markdown, email, url, phone, colour, number, decimal, currency,
 * percent, duration, integer, rating, file_size, boolean, date, datetime,
 * relative_time, json, array, tags, choice, multi_choice, formula. Twenty-five
 * columns, one per format, so a format assertion can name its own column.
 */
export const FIXTURE_FIELDS: FieldSpec[] = [
  { field_name: "job", display_name: "Job", data_type: "string", format: { id: "text" } },
  {
    field_name: "status",
    display_name: "Status",
    data_type: "string",
    format: {
      id: "choice",
      options: {
        choices: [
          { value: "Done", label: "Done", color: "green" },
          { value: "Blocked", label: "Blocked", color: "red" },
          { value: "Active", label: "Active", color: "blue" },
          { value: "Queued", label: "Queued", color: "amber" },
        ],
      },
    },
  },
  {
    field_name: "owner",
    display_name: "Owner",
    data_type: "string",
    format: { id: "text" },
    validation: { minLength: 2 },
  },
  { field_name: "amount", display_name: "Amount", data_type: "number", format: { id: "currency" } },
  { field_name: "share", display_name: "Share", data_type: "number", format: { id: "percent" } },
  { field_name: "qty", display_name: "Qty", data_type: "integer", format: { id: "integer" } },
  { field_name: "score", display_name: "Score", data_type: "number", format: { id: "decimal" } },
  { field_name: "plain_number", display_name: "Plain Number", data_type: "number", format: { id: "number" } },
  { field_name: "rating", display_name: "Rating", data_type: "integer", format: { id: "rating" } },
  { field_name: "bytes", display_name: "Bytes", data_type: "integer", format: { id: "file_size" } },
  { field_name: "seconds", display_name: "Seconds", data_type: "integer", format: { id: "duration" } },
  { field_name: "done", display_name: "Done", data_type: "boolean", format: { id: "boolean" } },
  { field_name: "due", display_name: "Due", data_type: "date", format: { id: "date" } },
  { field_name: "opened_at", display_name: "Opened At", data_type: "datetime", format: { id: "datetime" } },
  { field_name: "seen_at", display_name: "Seen At", data_type: "datetime", format: { id: "relative_time" } },
  { field_name: "notes", display_name: "Notes", data_type: "string", format: { id: "long_text" } },
  { field_name: "summary", display_name: "Summary", data_type: "string", format: { id: "markdown" } },
  { field_name: "email", display_name: "Email", data_type: "string", format: { id: "email" } },
  { field_name: "link", display_name: "Link", data_type: "string", format: { id: "url" } },
  { field_name: "phone", display_name: "Phone", data_type: "string", format: { id: "phone" } },
  { field_name: "swatch", display_name: "Swatch", data_type: "string", format: { id: "color" } },
  { field_name: "payload", display_name: "Payload", data_type: "json", format: { id: "json" } },
  { field_name: "labels", display_name: "Labels", data_type: "array", format: { id: "array" } },
  { field_name: "chips", display_name: "Chips", data_type: "array", format: { id: "tags" } },
  {
    field_name: "regions",
    display_name: "Regions",
    data_type: "array",
    format: {
      id: "multi_choice",
      options: {
        choices: [
          { value: "North", label: "North", color: "blue" },
          { value: "South", label: "South", color: "green" },
          { value: "East", label: "East", color: "purple" },
        ],
      },
    },
  },
  {
    field_name: "total",
    display_name: "Total",
    data_type: "number",
    format: {
      id: "formula",
      options: { formula: { expression: "{Amount} * {Qty}" } },
    },
  },
];

const STATUSES = ["Done", "Blocked", "Active", "Queued"] as const;
const OWNERS = ["Ada", "Bruno", "Cleo", "Dev", "Esme"] as const;
const REGIONS = ["North", "South", "East"] as const;

/**
 * Row `i` (0-based). Deterministic in `i` alone — no clock, no random — so the
 * two runs of the comparison read identical cells.
 */
export function fixtureRow(i: number): Record<string, unknown> {
  const status = STATUSES[i % STATUSES.length];
  const owner = OWNERS[i % OWNERS.length];
  return {
    job: `Job ${String(i + 1).padStart(3, "0")}`,
    status,
    owner,
    // Deliberately crosses 1000 so the "Amount > 1000" colour rule tints some
    // rows and not others, and so a numeric sort has a visible answer.
    amount: 250 + i * 37,
    share: (i % 20) / 20,
    qty: (i % 7) + 1,
    score: Number((i * 1.5).toFixed(2)),
    plain_number: i * 3,
    rating: (i % 5) + 1,
    bytes: 1024 * (i + 1),
    seconds: 60 * (i % 90) + 30,
    done: i % 3 === 0,
    due: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    opened_at: `2026-03-${String((i % 27) + 1).padStart(2, "0")}T09:30:00Z`,
    seen_at: `2026-09-${String((i % 19) + 1).padStart(2, "0")}T12:00:00Z`,
    notes: `Line one for job ${i + 1}\nLine two`,
    summary: `**Job ${i + 1}** is _${status.toLowerCase()}_`,
    email: `${owner.toLowerCase()}@example.com`,
    link: `https://example.com/jobs/${i + 1}`,
    phone: `555010${String(i % 100).padStart(2, "0")}`,
    swatch: ["#2563eb", "#16a34a", "#dc2626", "#d97706"][i % 4],
    payload: { index: i, owner },
    labels: [owner, status],
    chips: [status.toLowerCase(), `p${(i % 3) + 1}`],
    regions: [REGIONS[i % REGIONS.length]],
  };
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in the environment — the fixture cannot sign in.`);
  return v;
}

export async function signInAsAdmin(): Promise<SupabaseClient> {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const key = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: need("AI_ADMIN_USERNAME"),
    password: need("AI_ADMIN_PASSWORD"),
  });
  if (error) throw new Error(`Admin sign-in refused: ${error.message}`);
  if (data.user?.email !== process.env.AI_ADMIN_USERNAME) {
    throw new Error("Signed in as a different identity than the admin test account.");
  }
  return client;
}

type FieldRow = { id: string; field_name: string; display_name: string; field_order: number };

async function findTable(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.rpc("get_user_tables");
  if (error) throw new Error(`get_user_tables: ${error.message}`);
  const env = data as { tables?: unknown[]; data?: unknown[] } | null;
  const list = env?.tables ?? env?.data ?? [];
  for (const raw of list as Record<string, unknown>[]) {
    if (raw?.table_name === FIXTURE_TABLE_NAME) return String(raw.id);
  }
  return null;
}

async function fieldsOf(client: SupabaseClient, tableId: string): Promise<FieldRow[]> {
  const { data, error } = await client.rpc("get_full_table", {
    ref: { table_id: tableId } as never,
  });
  if (error) throw new Error(`get_full_table: ${error.message}`);
  const cols = (data as { columns?: unknown[] } | null)?.columns ?? [];
  return (cols as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    field_name: String(c.field_name),
    display_name: String(c.display_name),
    field_order: Number(c.field_order ?? 0),
  }));
}

async function main(): Promise<void> {
  const rowsWanted = Number(
    process.argv.includes("--rows")
      ? process.argv[process.argv.indexOf("--rows") + 1]
      : 120,
  );

  const client = await signInAsAdmin();
  console.log(`[fixture] signed in as the admin test identity`);

  let tableId = await findTable(client);

  if (!tableId) {
    const { data, error } = await client.rpc("create_new_user_table_dynamic", {
      p_table_name: FIXTURE_TABLE_NAME,
      p_description:
        "Fixed fixture for the /data grid before/after comparison. Safe to delete; the harness rebuilds it.",
      p_is_public: false,
      p_initial_fields: FIXTURE_FIELDS.map((f, i) => ({
        field_name: f.field_name,
        display_name: f.display_name,
        data_type: f.data_type,
        is_required: f.is_required ?? false,
        field_order: i,
      })),
    });
    if (error) throw new Error(`create_new_user_table_dynamic: ${error.message}`);
    const env = data as { success?: boolean; error?: string; table_id?: string } | null;
    if (!env?.success) throw new Error(`create refused: ${env?.error ?? "unknown"}`);
    tableId = String(env.table_id);
    console.log(`[fixture] created table ${tableId}`);
  } else {
    console.log(`[fixture] reusing table ${tableId}`);
  }

  // Columns: add any that are missing (a fixture grown after the table existed).
  const existing = await fieldsOf(client, tableId);
  const have = new Set(existing.map((f) => f.field_name));
  for (let i = 0; i < FIXTURE_FIELDS.length; i += 1) {
    const f = FIXTURE_FIELDS[i];
    if (have.has(f.field_name)) continue;
    const { data, error } = await client.rpc("add_column_to_user_table", {
      p_table_id: tableId,
      p_field_name: f.field_name,
      p_display_name: f.display_name,
      p_data_type: f.data_type,
      p_is_required: f.is_required ?? false,
      p_default_value: null,
      p_field_order: i,
    });
    if (error) throw new Error(`add_column ${f.field_name}: ${error.message}`);
    const env = data as { success?: boolean; error?: string } | null;
    if (!env?.success) throw new Error(`add_column ${f.field_name} refused: ${env?.error}`);
    console.log(`[fixture] added column ${f.field_name}`);
  }

  // Formats + validation, every run, so a changed spec lands.
  const now = await fieldsOf(client, tableId);
  const byName = new Map(now.map((f) => [f.field_name, f]));
  for (const f of FIXTURE_FIELDS) {
    const row = byName.get(f.field_name);
    if (!row) throw new Error(`column ${f.field_name} is missing after the add pass`);
    const { data, error } = await client.rpc("udt_set_field_format", {
      p_table_id: tableId,
      p_field_id: row.id,
      p_format: (f.format ?? null) as never,
    });
    if (error) throw new Error(`udt_set_field_format ${f.field_name}: ${error.message}`);
    const env = data as { success?: boolean; error?: string } | null;
    if (!env?.success) throw new Error(`format ${f.field_name} refused: ${env?.error}`);
    if (f.validation) {
      const { error: vErr } = await client
        .schema("workbench")
        .from("udt_dataset_fields")
        .update({ validation_rules: f.validation })
        .eq("id", row.id);
      if (vErr) throw new Error(`validation ${f.field_name}: ${vErr.message}`);
    }
  }
  console.log(`[fixture] ${FIXTURE_FIELDS.length} formats written`);

  // Rows. Replace wholesale so the two runs see identical data.
  const { data: complete, error: cErr } = await client.rpc("get_user_table_complete", {
    p_table_id: tableId,
    p_sort_field: undefined,
    p_sort_direction: "asc",
  });
  if (cErr) throw new Error(`get_user_table_complete: ${cErr.message}`);
  const currentRows = ((complete as { data?: unknown[] } | null)?.data ?? []) as Record<
    string,
    unknown
  >[];

  const ops: Record<string, unknown>[] = [];
  for (let i = 0; i < rowsWanted; i += 1) {
    const existingRow = currentRows[i];
    ops.push(
      existingRow
        ? { op: "update", row_id: String(existingRow.id), data: fixtureRow(i) }
        : { op: "insert", data: fixtureRow(i) },
    );
  }
  for (let i = rowsWanted; i < currentRows.length; i += 1) {
    ops.push({ op: "delete", row_id: String(currentRows[i].id) });
  }

  for (let start = 0; start < ops.length; start += 50) {
    const slice = ops.slice(start, start + 50);
    const { data, error } = await client.rpc("udt_bulk_write", {
      p_table_id: tableId,
      p_operations: slice as never,
    });
    if (error) throw new Error(`udt_bulk_write: ${error.message}`);
    // `udt_bulk_write` has no success envelope: it returns
    // `{table_id, count, results}` and RAISES on a real failure. A per-op
    // soft failure shows up as `{error:"row_not_found"}` inside results.
    const env = data as { count?: number; results?: unknown[] } | null;
    const failures = (env?.results ?? []).filter(
      (r) => typeof r === "object" && r !== null && "error" in (r as object),
    );
    if (!env || typeof env.count !== "number") {
      throw new Error(`bulk_write returned an unexpected envelope: ${JSON.stringify(data)}`);
    }
    if (failures.length) {
      throw new Error(`bulk_write: ${failures.length} op(s) failed, first ${JSON.stringify(failures[0])}`);
    }
  }
  console.log(`[fixture] ${rowsWanted} rows written`);

  // Read the rows back so the manual highlight can name a real row id.
  const { data: after, error: aErr } = await client.rpc("get_user_table_complete", {
    p_table_id: tableId,
    p_sort_field: undefined,
    p_sort_direction: "asc",
  });
  if (aErr) throw new Error(`get_user_table_complete (after): ${aErr.message}`);
  const rows = ((after as { data?: unknown[] } | null)?.data ?? []) as Record<string, unknown>[];
  // The manual highlight must land on a NAMED row, not on whatever the
  // unsorted read happened to return first — otherwise the two runs of the
  // comparison assert about different cells.
  const job001 = rows.find(
    (r) => (r.data as Record<string, unknown> | undefined)?.job === "Job 001",
  );
  const firstRowId = job001 ? String(job001.id) : null;
  if (!firstRowId) throw new Error("fixture: no row with job = 'Job 001' to highlight");

  // `udt_set_table_style` writes ONE path at a time (1..3 segments) so two
  // editors colouring different cells never overwrite each other. The fixture
  // therefore declares its colours as paths, not as one blob.
  const stylePaths: Array<{ path: string[]; value: unknown }> = [
    { path: ["colorBy"], value: { field: "status", target: "row" } },
    {
      path: ["rules"],
      value: [
        {
          id: "parity-amount-rule",
          field: "amount",
          op: "gt",
          value: "3000",
          color: "amber",
          target: "cell",
        },
      ],
    },
    { path: ["columns", "owner"], value: "blue" },
  ];
  if (firstRowId) {
    stylePaths.push({ path: ["cells", firstRowId, "job"], value: "purple" });
  }
  for (const { path, value } of stylePaths) {
    const { data: sData, error: sErr } = await client.rpc("udt_set_table_style", {
      p_table_id: tableId,
      p_path: path,
      p_value: value as never,
    });
    if (sErr) throw new Error(`udt_set_table_style ${path.join(".")}: ${sErr.message}`);
    const sEnv = sData as { success?: boolean; error?: string } | null;
    if (!sEnv?.success) throw new Error(`style ${path.join(".")} refused: ${sEnv?.error}`);
  }
  console.log(`[fixture] style written (colour-by status, rule amount>3000, 1 manual cell, 1 column)`);

  const handle = {
    tableId,
    tableName: FIXTURE_TABLE_NAME,
    rows: rowsWanted,
    firstRowId,
    fields: FIXTURE_FIELDS.map((f) => f.field_name),
    writtenAt: new Date().toISOString(),
  };
  writeFileSync(FIXTURE_HANDLE_PATH, `${JSON.stringify(handle, null, 2)}\n`);
  console.log(`[fixture] handle → ${FIXTURE_HANDLE_PATH}`);
  console.log(`[fixture] /data/${tableId}`);
}

if (process.argv[1] && process.argv[1].endsWith("fixture.ts")) {
  main().catch((err) => {
    console.error(`[fixture] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
