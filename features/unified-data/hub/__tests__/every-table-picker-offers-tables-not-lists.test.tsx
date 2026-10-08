// EVERY TABLE PICKER OFFERS TABLES, NOT LISTS (lane 10 W1-A, verifier finding 1).
//
// THE BREAK. Each choice column keeps a backing List ("Status choices"); `custom.data_home_tables()`
// returns them with `platform_owned: true, kind: "list"`. The Messages custom-data picker mapped
// every row straight into its options, so a clinic with five Status columns was offered "Status
// choices" five times beside its real tables. This mounts it over that account and runs the one
// rule (`@ai-matrx/records-ui`'s `tablePickerEntries`, through `tablePicking.ts`'s adapter) over the same rows, so a picker that stops calling the rule goes red.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { tablePickerEntries } from "@ai-matrx/records-ui";

import { tablesToPick, pickerRow } from "../tablePicking";
import type { DataHomeTableRow } from "../doors";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "c3000000-0000-4000-8000-000000000003";
const row = (id: string, name: string, kept: boolean, kind: string): DataHomeTableRow =>
  ({
    table_id: id,
    table_name: name,
    organization_id: ORG,
    organization_name: "Cedar Ridge Veterinary",
    member: true,
    visibility: "internal",
    updated_at: null,
    mine: true,
    shared_with_me: false,
    platform_owned: kept,
    kind,
  }) as DataHomeTableRow;

const ROWS: DataHomeTableRow[] = [
  row("a1000000-0000-4000-8000-000000000001", "Patient Visits", false, "table"),
  row("a1000000-0000-4000-8000-000000000002", "Pet Owners", false, "table"),
  ...[1, 2, 3, 4, 5].map((i) => row(`b2000000-0000-4000-8000-00000000000${i}`, "Status choices", true, "list")),
  row("c3000000-0000-4000-8000-000000000009", "Pre-surgery checklist steps", true, "checklist"),
];

jest.mock("@/features/unified-data/hub/useTablesEverywhere", () => ({
  useTablesEverywhere: () => ({ loading: false, error: null, reload: jest.fn(), rows: ROWS }),
}));
jest.mock("@ai-matrx/records/react", () => ({
  useTable: () => ({ loading: false, error: null, reload: jest.fn(), data: null }),
  useFields: () => ({ loading: false, error: null, reload: jest.fn(), data: [] }),
  useRecordPage: () => ({ loading: false, error: null, reload: jest.fn(), data: { rows: [], total: 0 } }),
}));
jest.mock("@ai-matrx/records-ui", () => {
  // The one rule is the package's own; only the record-label helpers are stubbed.
  const actual = jest.requireActual("@ai-matrx/records-ui");
  return {
    tablePickerEntries: actual.tablePickerEntries,
    isValueSet: actual.isValueSet,
    isKeptTable: actual.isKeptTable,
    fieldName: (f: { key: string }) => f.key,
    rowNameIn: () => "",
  };
});
jest.mock("@/features/agents/components/variables-management/custom-data/CustomDataRecordsScope", () => ({
  CustomDataRecordsScope: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/ui/creatable-picker", () => ({
  CreatablePicker: ({ options }: { options: Array<{ value: string; label: string }> }) => (
    <ul data-testid="table-options">
      {options.map((o) => (
        <li key={o.value}>{o.label}</li>
      ))}
    </ul>
  ),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import MessagesCustomDataPicker from "@/features/messaging/components/MessagesCustomDataPicker";

describe("the one table-picker rule", () => {
  it("offers only tables by default, and keeps a chosen list", () => {
    expect(tablesToPick(ROWS).map((r) => r.table_name)).toEqual(["Patient Visits", "Pet Owners"]);
    expect(tablesToPick(ROWS, "b2000000-0000-4000-8000-000000000003").map((r) => r.table_name)).toContain("Status choices");
  });

  it("with Show lists counts every list", () => {
    expect(tablePickerEntries(ROWS.map(pickerRow), { showLists: true }).listCount).toBe(5);
  });
});

describe("the Messages custom-data picker", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers the clinic's tables and none of its choice lists", () => {
    act(() => root.render(<MessagesCustomDataPicker onPick={jest.fn()} />));
    const offered = Array.from(container.querySelectorAll("[data-testid=table-options] li")).map((li) => li.textContent);
    expect(offered).toEqual(["Patient Visits", "Pet Owners"]);
  });
});
