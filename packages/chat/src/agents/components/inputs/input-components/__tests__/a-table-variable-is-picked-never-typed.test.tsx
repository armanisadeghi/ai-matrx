/**
 * THE USE CASE (Arman, 2026-10-03): "Answers From Your Tables" asks for the main table. The run
 * form must offer THE table picker (every table the person can see) and hand back the table's id —
 * never a text box. Tables (plural) collects several ids and each can be removed.
 *
 * RED before the change: `table` was not a component type, so the variable drew a textarea.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const VISITS = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
const PATIENTS = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const ROWS = [
  { table_id: VISITS, table_name: "Patient Visits", organization_id: "o1", organization_name: "Linden Hollow" },
  { table_id: PATIENTS, table_name: "Patients", organization_id: "o2", organization_name: "Quillan Creek" },
];

// The picker itself is proven by the-table-picker-lists-every-organization; here it is a button per
// offered table, so the test can pick like a person.
jest.mock("@host/features/unified-data/hub/TableChooser", () => ({
  TableChooser: ({
    tables,
    exclude,
    onSelect,
  }: {
    tables: { rows: typeof ROWS };
    exclude?: string[];
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="table-chooser">
      {tables.rows
        .filter((r) => !(exclude ?? []).includes(r.table_id))
        .map((r) => (
          <button key={r.table_id} type="button" data-pick={r.table_id} onClick={() => onSelect(r.table_id)}>
            {r.table_name}
          </button>
        ))}
    </div>
  ),
}));
jest.mock("@host/features/unified-data/hub/useTablesEverywhere", () => ({
  useTablesEverywhere: () => ({ loading: false, error: null, rows: ROWS, reload: () => undefined }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TableVariableInput } = require("../TableVariableInput") as typeof import("../TableVariableInput");

async function mount(node: React.ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

it("Table: the person picks a table and the value is its id — no text box", async () => {
  const changes: unknown[] = [];
  const { host, root } = await mount(
    <TableVariableInput type="table" value="" onChange={(v) => changes.push(v)} variableName="primary_table" />,
  );
  expect(host.querySelector("textarea, input[type='text']")).toBeNull();
  await act(async () => (host.querySelector(`[data-pick="${VISITS}"]`) as HTMLButtonElement).click());
  expect(changes).toEqual([VISITS]);
  await act(async () => root.unmount());
});

it("Tables: picks add ids, chosen tables show by name and can be removed", async () => {
  const changes: unknown[] = [];
  const { host, root } = await mount(
    <TableVariableInput type="tables" value={[VISITS]} onChange={(v) => changes.push(v)} variableName="related_tables" />,
  );
  expect(host.textContent).toContain("Patient Visits");
  // An already-chosen table is not offered again.
  expect(host.querySelector(`[data-pick="${VISITS}"]`)).toBeNull();
  await act(async () => (host.querySelector(`[data-pick="${PATIENTS}"]`) as HTMLButtonElement).click());
  expect(changes.at(-1)).toEqual([VISITS, PATIENTS]);
  await act(async () => (host.querySelector('[aria-label="Remove Patient Visits"]') as HTMLButtonElement).click());
  expect(changes.at(-1)).toEqual([]);
  await act(async () => root.unmount());
});
