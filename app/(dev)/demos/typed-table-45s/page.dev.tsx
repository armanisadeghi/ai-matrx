"use client";

/**
 * THE 45-SECOND TABLE, FROM CODE (lane CHAIR-45S, 2026-10-03).
 *
 * One `defineAppTable` declaration below is the whole data layer of this page: the table is made
 * in the active organization on the first save (`custom.table_ensure`, idempotent), the rows are
 * typed from the declaration (`RowOf` / `InsertOf` — a wrong column or type fails `tsc`, no
 * codegen), and every write walks the store's own doors as the signed-in person.
 */

import { useState } from "react";
import { defineAppTable, f, type InsertOf, type RowOf } from "@ai-matrx/records/app-table";
import { RecordsProvider, useAppTable } from "@ai-matrx/records/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { Button } from "@ai-matrx/design-system/controls";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

// ── 1. the table, declared once ────────────────────────────────────────────────────────────
export const supplyReorderPoints = defineAppTable({
  name: "Supply reorder points",
  slug: "supply_reorder_points",
  scope: "organization",
  kept_for: "demos",
  key: "item",
  fields: {
    item: f.text({ required: true, unique: true, label: "Item" }),
    category: f.select(["Exam room", "Lab", "Front desk", "Cleaning"] as const),
    on_hand: f.integer({ label: "On hand" }),
    reorder_at: f.integer({ required: true, label: "Reorder at" }),
    unit_cost: f.currency("USD", { label: "Unit cost" }),
    last_counted: f.date({ label: "Last counted" }),
  },
});

type Row = RowOf<typeof supplyReorderPoints>; //  { item: string; category: "Exam room" | … | null; on_hand: number | null; … }
type NewRow = InsertOf<typeof supplyReorderPoints>; // item + reorder_at required, the rest optional

// ── 2. the page ────────────────────────────────────────────────────────────────────────────
export default function TypedTable45sPage() {
  const userId = useAppSelector(selectUserId);
  // org-filter: server-call the demo table lives in the one organization the person works in
  const active = useOrganizationRequired();
  const recordsConfig = useAppRecordsConfig(active.organizationId ?? null);
  if (!userId || active.organizationState !== "ready" || !active.organizationId) {
    return <OrganizationContextNotice state={userId ? active.organizationState : "resolving"} what="Supply reorder points" />;
  }
  return (
    <RecordsProvider config={recordsConfig}>
      <ReorderBoard />
    </RecordsProvider>
  );
}

const SAMPLE: NewRow[] = [
  { item: "Nitrile exam gloves (M)", category: "Exam room", on_hand: 14, reorder_at: 10, unit_cost: 8.4, last_counted: "2026-10-01" },
  { item: "Specimen cups 90 mL", category: "Lab", on_hand: 3, reorder_at: 6, unit_cost: 0.22, last_counted: "2026-10-01" },
  { item: "Appointment reminder cards", category: "Front desk", on_hand: 250, reorder_at: 100, unit_cost: 0.05 },
];

function ReorderBoard() {
  const { rows, upsert, remove, loading, error, status, total } = useAppTable(supplyReorderPoints);
  const [item, setItem] = useState("");
  const [onHand, setOnHand] = useState("");
  const [reorderAt, setReorderAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastWrite, setLastWrite] = useState<string | null>(null);

  async function save(row: NewRow) {
    const started = performance.now();
    setBusy(row.item);
    const written = await upsert(row);
    setBusy(null);
    setLastWrite(written.ok ? `${row.item} saved in ${Math.round(performance.now() - started)} ms` : written.error.message);
  }

  const low = (r: Row) => r.on_hand !== null && r.on_hand < r.reorder_at;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-3 type-body">
        <span className="font-medium">Supply reorder points</span>
        <span className="text-muted-foreground">table {status ?? "…"}</span>
        <span className="text-muted-foreground">{total ?? 0} rows</span>
        <Button variant="outline" disabled={busy !== null} onClick={async () => { for (const s of SAMPLE) await save(s); }} className="ml-auto">
          Add 3 sample items
        </Button>
      </div>
      {error && <p className="type-body text-destructive">{error.message}</p>}
      <form
        className="flex flex-wrap items-end gap-2 type-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!item.trim() || !reorderAt) return;
          void save({ item: item.trim(), on_hand: onHand ? Number(onHand) : null, reorder_at: Number(reorderAt) });
          setItem(""); setOnHand(""); setReorderAt("");
        }}
      >
        <label className="flex flex-col">Item<input className="rounded border px-2 py-1" value={item} onChange={(e) => setItem(e.target.value)} /></label>
        <label className="flex flex-col">On hand<input className="w-24 rounded border px-2 py-1" type="number" value={onHand} onChange={(e) => setOnHand(e.target.value)} /></label>
        <label className="flex flex-col">Reorder at<input className="w-24 rounded border px-2 py-1" type="number" required value={reorderAt} onChange={(e) => setReorderAt(e.target.value)} /></label>
        <Button variant="outline" type="submit" disabled={busy !== null}>Save</Button>
      </form>
      {lastWrite && <p className="type-secondary text-muted-foreground" data-testid="last-write">{lastWrite}</p>}
      <table className="w-full type-body">
        <thead><tr className="text-left text-muted-foreground"><th>Item</th><th>Category</th><th>On hand</th><th>Reorder at</th><th>Unit cost</th><th></th></tr></thead>
        <tbody>
          {loading && rows.length === 0 && <tr><td colSpan={6}>Loading…</td></tr>}
          {rows.map((r) => (
            <tr key={r._id} className={low(r) ? "text-destructive" : undefined}>
              <td>{r.item}</td><td>{r.category ?? ""}</td><td>{r.on_hand ?? ""}</td><td>{r.reorder_at}</td><td>{r.unit_cost ?? ""}</td>
              <td><Button variant="link" onClick={() => void remove(r._id)}>archive</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
