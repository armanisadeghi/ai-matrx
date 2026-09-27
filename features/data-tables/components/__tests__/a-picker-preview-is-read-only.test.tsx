/**
 * A PICKER PREVIEW IS READ-ONLY IN EITHER GRID (merged-grid review 2, fix lane F item 3).
 *
 * Review 2 opened the tables picker's preview and got a near-full-screen, FULLY EDITABLE merged
 * grid: a person choosing a reference could rewrite the table by accident. `readOnly` on the one
 * located viewer reaches both grids — records-ui's `rights` port (bound → its answer is the whole
 * answer, per row too) for a record-store table, `previewOnly` for an older one.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const locateTable = jest.fn();
jest.mock("@/features/data-tables/data-source/locate-table", () => ({
  locateTable: (...args: unknown[]) => locateTable(...args),
  recordStoreCopyOf: async () => false,
}));
const viewerProps: Array<Record<string, unknown>> = [];
jest.mock("@/components/user-generated-table-data/UserTableViewer", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    viewerProps.push(props);
    return <div data-testid="older-grid" />;
  },
}));
const hostProps: Array<Record<string, unknown>> = [];
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  RecordStoreTableHost: (props: Record<string, unknown>) => {
    hostProps.push(props);
    return <div data-testid="records-ui-table" />;
  },
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/ui/loading-spinner", () => ({ __esModule: true, default: () => <span>opening</span> }));

import LocatedTableViewer from "../LocatedTableViewer";

const TABLE = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";
let container: HTMLDivElement;
let root: Root;
async function mount(node: React.ReactElement) {
  await act(async () => root.render(node));
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  locateTable.mockReset();
  viewerProps.length = 0;
  hostProps.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LocatedTableViewer readOnly (the picker's preview)", () => {
  it("a record-store table's preview binds the host read-only", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "record", home: { store: "record", organizationId: "o", userId: "u" } });
    await mount(<LocatedTableViewer tableId={TABLE} readOnly />);
    expect(hostProps[0]).toMatchObject({ tableId: TABLE, readOnly: true });
  });

  it("an older table's preview is previewOnly", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "older" });
    await mount(<LocatedTableViewer tableId={TABLE} readOnly />);
    expect(viewerProps[0]).toMatchObject({ previewOnly: true });
    expect(viewerProps[0]).not.toHaveProperty("readOnly");
  });

  it("without readOnly, neither grid is narrowed", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "older" });
    await mount(<LocatedTableViewer tableId={TABLE} />);
    expect(viewerProps[0]).not.toHaveProperty("previewOnly");
  });
});
