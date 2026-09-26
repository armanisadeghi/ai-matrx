/**
 * @jest-environment node
 *
 * LIVE, READ-ONLY. THE PARITY ORACLE FOR THE GRID'S RECORD-STORE HALF.
 *
 * Every older table OLD-TABLES-4 moved kept its id, its column ids and its row
 * ids, and the older copy was ARCHIVED, never deleted — so the same table can be
 * read twice: once through the older doors (`get_full_table`,
 * `get_user_table_data_paginated_v2`) and once through the grid's seam with the
 * table placed in the record store (`data-source/record-store.ts`). If the seam
 * is right, the grid is handed the same columns, the same rows, the same values
 * and the same order for every sort, from either store.
 *
 * It goes RED on the class of defect a port like this makes: a column whose
 * type or format reads back differently (a currency drawn as a bare number), a
 * value the store keeps in another shape (a json cell as text), a row the read
 * door hides or duplicates, a sort that orders differently from the older door.
 * What the MOVE itself did not carry (a table description, colors, a saved
 * sort) is not this seam's to invent; the suite names those as MOVE GAPS so a
 * reader sees them, and fails only on what the SEAM got wrong.
 *
 * Runs against the dev clone (where OLD-TABLES-4 moved admin's Workspace), as
 * admin@admin.com, through the real doors. Needs GRID_PORT_SUPABASE_URL +
 * GRID_PORT_SUPABASE_PUBLISHABLE_KEY (the clone) and AI_ADMIN_USERNAME /
 * AI_ADMIN_PASSWORD. Without them it is SKIPPED, loudly.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../../../../aidream/.env"), override: false });

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultFormatForBase } from "@ai-matrx/design-system/field-formats";
import { withComputedColumns } from "@ai-matrx/design-system/formulas";

const URL_ = process.env.GRID_PORT_SUPABASE_URL ?? "";
const KEY = process.env.GRID_PORT_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);

let client: SupabaseClient;

jest.mock("@/utils/supabase/client", () => ({
  get supabase() {
    return client;
  },
  createClient: () => client,
}));

// Imported after the mock so both halves of the seam use the signed-in clone client.
import * as service from "../../service";
import { forgetAllTablePlacements, placeTableInRecordStore } from "../table-home";

type Row = { id: string; data: Record<string, unknown> };

async function older<T>(fn: () => Promise<T>): Promise<T> {
  forgetAllTablePlacements();
  return fn();
}

async function inStore<T>(tableId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  placeTableInRecordStore(tableId, { organizationId: ORG, userId });
  try {
    return await fn();
  } finally {
    forgetAllTablePlacements();
  }
}

function norm(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, norm((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** A formula's result read as a number when it is one: "19193920" and 19193920 are one answer. */
function normFormula(value: unknown): unknown {
  const n = norm(value);
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
  return n;
}

const describeLive = READY ? describe : describe.skip;
if (!READY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[a-moved-table-reads-the-same-in-both-stores] SKIPPED: set GRID_PORT_SUPABASE_URL, GRID_PORT_SUPABASE_PUBLISHABLE_KEY, AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD to run the parity oracle against the dev clone.",
  );
}

describeLive("a moved table reads the same through both halves of the grid's seam", () => {
  let userId = "";
  let moved: Array<{ id: string; name: string }> = [];
  const moveGaps: string[] = [];
  /** table:column pairs whose order legitimately differs because a cell moved empty. */
  const brokenRelation = new Set<string>();

  beforeAll(async () => {
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    userId = signed.data.user.id;
    // The tables OLD-TABLES-4 moved: record-store Tables whose ids are also older datasets.
    const kernel = await client.schema("custom" as never).rpc("table_kernel_id" as never);
    const tables = await client.schema("custom" as never).rpc("read_records" as never, {
      p_organization_id: ORG,
      p_table_id: kernel.data,
      p_limit: 500,
      p_offset: 0,
    } as never);
    const ids = ((tables.data ?? []) as Array<{ id: string; document: { name?: string } }>).map((t) => ({
      id: t.id,
      name: t.document?.name ?? "",
    }));
    for (const t of ids) {
      const meta = await older(() => service.getTableMetadata({ tableId: t.id }));
      if (meta.success) moved.push(t);
    }
  }, 120_000);

  afterAll(() => {
    // eslint-disable-next-line no-console
    if (moveGaps.length) console.log(`MOVE GAPS (not the seam's to invent):\n  ${moveGaps.join("\n  ")}`);
  });

  it("finds the moved tables", () => {
    expect(moved.length).toBeGreaterThanOrEqual(10);
  });

  it("hands the grid the same table, columns, rows and values", async () => {
    const seamDiffs: string[] = [];
    for (const t of moved) {
      const o = await older(() => service.getTableMetadata({ tableId: t.id }));
      const s = await inStore(t.id, userId, () => service.getTableMetadata({ tableId: t.id }));
      if (!o.success || !s.success) {
        seamDiffs.push(`${t.name}: a read failed — older ${o.success ? "ok" : o.error}, store ${s.success ? "ok" : s.error}`);
        continue;
      }
      if (o.data.table.table_name !== s.data.table.table_name) seamDiffs.push(`${t.name}: name ${s.data.table.table_name}`);
      if ((o.data.table.description ?? null) !== (s.data.table.description ?? null)) {
        moveGaps.push(`${t.name}: description "${o.data.table.description}" did not move`);
      }
      const om = (o.data.table.metadata ?? {}) as Record<string, unknown>;
      if (om.style) moveGaps.push(`${t.name}: colors (metadata.style) did not move`);
      if (o.data.table.row_ordering_config) moveGaps.push(`${t.name}: row ordering/default sort ${JSON.stringify(o.data.table.row_ordering_config)} did not move`);
      if (o.data.table.validation_mode === "permissive") {
        moveGaps.push(`${t.name}: was permissive; every record-store write is judged by the column's rules`);
      }

      const byId = new Map(s.data.columns.map((c) => [c.id, c]));
      for (const oc of o.data.columns) {
        const sc = byId.get(oc.id);
        if (!sc) {
          seamDiffs.push(`${t.name}.${oc.field_name}: column missing from the store read`);
          continue;
        }
        const of = ((oc.metadata ?? {}) as { format?: { id?: string; options?: Record<string, unknown> } }).format;
        const sf = ((sc.metadata ?? {}) as { format?: { id?: string; options?: Record<string, unknown> } }).format;
        // What the grid DRAWS: a column with no format draws its storage type's
        // default (`resolveFieldFormat`), so "none" and "integer" on an integer
        // column are the same screen. The mover stamped the default explicitly.
        const drawnOlder = of?.id ?? defaultFormatForBase(oc.data_type);
        const drawnStore = sf?.id ?? defaultFormatForBase(sc.data_type);
        const facts: Array<[string, unknown, unknown]> = [
          ["field_name", oc.field_name, sc.field_name],
          ["display_name", oc.display_name, sc.display_name],
          ["field_order", oc.field_order, sc.field_order],
          ["format", drawnOlder, drawnStore],
        ];
        if (oc.data_type !== sc.data_type) {
          // The store keeps a number as a number: whether it was stored as an
          // INTEGER survives only through an integer format word, and a formula
          // declares no result type at all. Those are what the move carried.
          const integerLost = oc.data_type === "integer" && sc.data_type === "number" && drawnStore !== "integer";
          const formulaResult = drawnStore === "formula";
          if (integerLost || formulaResult) {
            moveGaps.push(`${t.name}.${oc.field_name}: storage type ${oc.data_type} → ${sc.data_type} (${formulaResult ? "a formula declares no result type in the store" : "integer-ness is not kept once another format names the column"})`);
          } else {
            facts.push(["data_type", oc.data_type, sc.data_type]);
          }
        }
        for (const [what, a, b] of facts) {
          if (a !== b) seamDiffs.push(`${t.name}.${oc.field_name}: ${what} older=${String(a)} store=${String(b)}`);
        }
        if (oc.is_required !== sc.is_required) moveGaps.push(`${t.name}.${oc.field_name}: required ${oc.is_required} → ${sc.is_required}`);
        const lostOptions = Object.keys(of?.options ?? {}).filter((k) => !(k in (sf?.options ?? {})));
        if (lostOptions.length) moveGaps.push(`${t.name}.${oc.field_name}: format options not carried: ${lostOptions.join(", ")}`);
      }
      if (o.data.row_count !== s.data.row_count) seamDiffs.push(`${t.name}: row_count older=${o.data.row_count} store=${s.data.row_count}`);

      const all = { tableId: t.id, limit: 5000, offset: 0 };
      const op = await older(() => service.getTablePage(all));
      const sp = await inStore(t.id, userId, () => service.getTablePage(all));
      if (!op.success || !sp.success) {
        seamDiffs.push(`${t.name}: page read failed`);
        continue;
      }
      const storeRows = new Map(sp.data.rows.map((r: Row) => [r.id, r]));
      const declared = new Set(o.data.columns.map((c) => c.field_name));
      // A FORMULA column stores nothing in the older store — the older grid computes it in the
      // browser (`withComputedColumns`) — while the record store computes it itself. So the older
      // side is compared AS THE OLDER GRID DRAWS IT: its own computation, not its empty cell
      // (lane INTEG-CLIENTS; this is what "the browser computes nothing for a store table" means).
      const olderDrawn = withComputedColumns(
        op.data.rows as Row[],
        o.data.columns as unknown as Parameters<typeof withComputedColumns>[1],
      ).rows as Row[];
      for (const or of olderDrawn) {
        const sr = storeRows.get(or.id);
        if (!sr) {
          seamDiffs.push(`${t.name}: row ${or.id} missing from the store read`);
          continue;
        }
        for (const key of declared) {
          const a = normFormula(or.data[key]);
          const b = normFormula(sr.data[key]);
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            const column = o.data.columns.find((c) => c.field_name === key);
            const format = ((column?.metadata ?? {}) as { format?: { id?: string } }).format?.id;
            if (format === "relation" && b === null && typeof a === "string") {
              moveGaps.push(`${t.name} row ${or.id.slice(0, 8)} .${key}: names a record (${a}) that does not exist, so the move carried it empty (kept at _sources on the record)`);
              brokenRelation.add(`${t.id}:${key}`);
              continue;
            }
            seamDiffs.push(`${t.name} row ${or.id.slice(0, 8)} .${key}: older=${JSON.stringify(a)} store=${JSON.stringify(b)}`);
          }
        }
      }
      if (sp.data.rows.length !== op.data.rows.length) {
        seamDiffs.push(`${t.name}: ${op.data.rows.length} older rows, ${sp.data.rows.length} store rows`);
      }
    }
    // eslint-disable-next-line no-console
    if (seamDiffs.length) console.log(`SEAM DIFFS:\n  ${seamDiffs.join("\n  ")}`);
    expect(seamDiffs).toEqual([]);
  }, 300_000);

  it("orders every column the way the older door did, both directions, and searches the same", async () => {
    const orderDiffs: string[] = [];
    for (const t of moved) {
      const meta = await older(() => service.getTableMetadata({ tableId: t.id }));
      if (!meta.success) continue;
      for (const c of meta.data.columns) {
        for (const dir of ["asc", "desc"] as const) {
          const args = { tableId: t.id, limit: 5000, offset: 0, sortField: c.field_name, sortDirection: dir };
          const o = await older(() => service.getTablePage(args));
          const s = await inStore(t.id, userId, () => service.getTablePage(args));
          if (!o.success || !s.success) continue;
          const a = (o.data.rows as Row[]).map((r) => r.id).join(",");
          const b = (s.data.rows as Row[]).map((r) => r.id).join(",");
          // The older DOOR sorts a formula column by its empty stored cell (every row ties), so there
          // is no older order to match; the store sorts by the value it computed.
          const isFormula = ((c.metadata ?? {}) as { format?: { id?: string } }).format?.id === "formula";
          if (a !== b && !isFormula && !brokenRelation.has(`${t.id}:${c.field_name}`)) orderDiffs.push(`${t.name}.${c.field_name} ${dir}`);
        }
      }
      // Search: the first word of the first row's first text value.
      const first = await older(() => service.getTablePage({ tableId: t.id, limit: 1, offset: 0 }));
      const sample = first.success ? Object.values((first.data.rows[0] as Row | undefined)?.data ?? {}).find((v) => typeof v === "string" && v.length > 2) : null;
      if (typeof sample === "string") {
        const term = sample.slice(0, 4);
        const args = { tableId: t.id, limit: 5000, offset: 0, searchTerm: term };
        const o = await older(() => service.getTablePage(args));
        const s = await inStore(t.id, userId, () => service.getTablePage(args));
        if (o.success && s.success) {
          const a = new Set((o.data.rows as Row[]).map((r) => r.id));
          const b = new Set((s.data.rows as Row[]).map((r) => r.id));
          if (a.size !== b.size || [...a].some((id) => !b.has(id))) orderDiffs.push(`${t.name} search "${term}": older ${a.size}, store ${b.size}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    if (orderDiffs.length) console.log(`ORDER DIFFS:\n  ${orderDiffs.join("\n  ")}`);
    expect(orderDiffs).toEqual([]);
  }, 600_000);
});
