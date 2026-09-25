/**
 * A SCHEDULE ON A MOVED TABLE LISTENS FOR THE RECORD STORE'S CHANGES (lane INTEG-CLIENTS,
 * CUTOVER-PLAN rev 3 rows F9 / D8).
 *
 * The real use case: Rincon Plumbing's dispatcher has "When a service call's stage changes, text
 * the customer" on the "Service Calls" table. The table moved into the record store; the older
 * copy is archived and emits no row events again, so a trigger still saying `user_table_row`
 * never fires — exactly production's enabled trigger on "Table 1 · 2nd" (D8). Before the repoint
 * this form listed the older tables only (the moved table vanished from the picker) and never
 * asked where the chosen table lives. Now it lists both stores and saves the store's own word.
 *
 * The data seam is replaced by its answers (the seam's live suites prove the doors themselves);
 * what this proves is the FORM: which list it asks, and which word it saves.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { EventConfig } from "../../../../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // moved into the record store
const VEGAS_EVENTS = "5b0c3f0e-8a7e-4d8e-9d52-2f6f3c1f1a90"; // still an older table

const olderOnly = [
  { id: VEGAS_EVENTS, table_name: "Vegas Events", description: null, row_count: 12, field_count: 4 },
];
const everywhere = [
  ...olderOnly.map((t) => ({ ...t, store: "older" as const })),
  { id: SERVICE_CALLS, table_name: "Rincon Plumbing — Service Calls", description: null, row_count: 9, field_count: 7, store: "records" as const },
];

const listUserTables = jest.fn(async () => ({ success: true as const, data: olderOnly }));
const listTablesEverywhere = jest.fn(async () => ({ success: true as const, data: everywhere }));
jest.mock("@/features/data-tables/service", () => ({
  listUserTables: () => listUserTables(),
  listTablesEverywhere: () => listTablesEverywhere(),
  getTableMetadata: async () => ({
    success: true,
    data: { columns: [{ field_name: "stage", display_name: "Stage" }] },
  }),
  rowChangeScheduleFor: async ({ tableId }: { tableId: string }) =>
    tableId === SERVICE_CALLS
      ? { entityType: `record:${SERVICE_CALLS}`, actions: [] }
      : { entityType: "user_table_row", actions: [] },
}));
jest.mock("@/features/data-tables/data-source/locate-table", () => ({
  locateTable: async (tableId: string) =>
    tableId === SERVICE_CALLS ? { ok: true, store: "record", home: {} } : { ok: true, store: "older" },
}));

import { EventForm } from "../EventForm";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.clearAllMocks();
});

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

it("asks for the tables of BOTH stores", async () => {
  await act(async () => {
    root.render(<EventForm value={{}} onChange={() => {}} />);
  });
  await settle();
  expect(listTablesEverywhere).toHaveBeenCalled();
  expect(listUserTables).not.toHaveBeenCalled();
});

it("a schedule made on the table before its move is re-keyed to the store's change word", async () => {
  const saved: EventConfig[] = [];
  await act(async () => {
    root.render(
      <EventForm
        value={{ entity_type: "user_table_row", table_id: SERVICE_CALLS, actions: ["row.updated"], changed_fields: ["stage"] }}
        onChange={(v) => saved.push(v)}
      />,
    );
  });
  await settle();
  const last = saved.at(-1);
  expect(last?.entity_type).toBe(`record:${SERVICE_CALLS}`);
  expect(last?.table_id).toBe(SERVICE_CALLS);
  // `row.updated` is the older store's word; it never fires on a store table, so it is dropped.
  expect(last?.actions).toBeUndefined();
  expect(last?.changed_fields).toEqual(["stage"]);
});

it("an older table keeps the older word", async () => {
  const saved: EventConfig[] = [];
  await act(async () => {
    root.render(<EventForm value={{ entity_type: "user_table_row", table_id: VEGAS_EVENTS }} onChange={(v) => saved.push(v)} />);
  });
  await settle();
  expect(saved.filter((v) => v.entity_type !== "user_table_row")).toEqual([]);
});

it("a trigger saved by an older client under custom_record:<table> is read as the store table and saved as record:<table> (lane SOURCE-KEY)", async () => {
  const saved: EventConfig[] = [];
  await act(async () => {
    root.render(
      <EventForm
        value={{ entity_type: `custom_record:${SERVICE_CALLS}`, table_id: SERVICE_CALLS, actions: ["record.updated"] }}
        onChange={(v) => saved.push(v)}
      />,
    );
  });
  await settle();
  // The store's words are offered (it IS a store table), and "A row is changed" stays ticked.
  expect(host.textContent).toContain("A row is changed");
  expect(host.textContent).not.toContain("A row is deleted");
  act(() => {
    (Array.from(host.querySelectorAll("label")).find((l) => l.textContent === "A row is added")!.querySelector("button") as HTMLButtonElement).click();
  });
  const last = saved.at(-1);
  expect(last?.entity_type).toBe(`record:${SERVICE_CALLS}`);
  expect(last?.actions).toEqual(["record.updated", "record.created"]);
  expect(saved.some((v) => v.entity_type.startsWith("custom_record:"))).toBe(false);
});
