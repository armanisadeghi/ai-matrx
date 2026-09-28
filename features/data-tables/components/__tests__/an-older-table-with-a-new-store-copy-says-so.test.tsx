/**
 * A TABLE IN BOTH STORES SAYS WHICH ONE IS DRAWN (merged-grid review 2, fix lane F item 2).
 *
 * Until the custom-data lead's one flip, a table that lives in both stores resolves to the OLDER
 * store (`custom.where_tables_live` → "older"), so every consumer outside the table page (the table
 * window, the dataset overlay, a chat table artifact, the quick sheet, the picker, the "view table"
 * modal) draws the older grid — correctly. What was wrong is silence: review 2 saw the older grid
 * with the merged-grid knob on and nothing said why. The consumer says it in the older grid's own
 * notice band, beside its read-only chip (never a redirect, never a second grid):
 * "This table still runs in the older store until it is switched over".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const locateTable = jest.fn();
const recordStoreCopyOf = jest.fn();
jest.mock("@/features/data-tables/data-source/locate-table", () => ({
  locateTable: (...args: unknown[]) => locateTable(...args),
  recordStoreCopyOf: (...args: unknown[]) => recordStoreCopyOf(...args),
}));

const viewerProps: Array<Record<string, unknown>> = [];
jest.mock("@/components/user-generated-table-data/UserTableViewer", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    viewerProps.push(props);
    return (
      <div data-testid="older-grid">
        {props.storeNotice as React.ReactNode}
        {props.toolbarTrailing as React.ReactNode}
      </div>
    );
  },
}));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  RecordStoreTableHost: () => <div data-testid="records-ui-table" />,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/ui/loading-spinner", () => ({ __esModule: true, default: () => <span>opening</span> }));

import LocatedTableViewer from "../LocatedTableViewer";

const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014";
const SENTENCE = "This table still runs in the older store until it is switched over";

let container: HTMLDivElement;
let root: Root;
async function mount(node: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(node);
  });
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  locateTable.mockReset();
  recordStoreCopyOf.mockReset();
  viewerProps.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LocatedTableViewer — a table in both stores", () => {
  it("draws the older grid (the lead's routing) and says so in its toolbar row", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "older" });
    recordStoreCopyOf.mockResolvedValue(true);
    const trailing = <button type="button">Revert to text</button>;
    await mount(<LocatedTableViewer tableId={TABLE} toolbarTrailing={trailing} />);
    expect(container.querySelector('[data-testid="records-ui-table"]')).toBeNull();
    const notice = container.querySelector('[data-table-store-notice="older"]');
    expect(notice?.textContent).toContain(SENTENCE);
    // The host's own trailing controls are kept beside it.
    expect(container.textContent).toContain("Revert to text");
  });

  it("an older table with no copy in the new store says nothing", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "older" });
    recordStoreCopyOf.mockResolvedValue(false);
    await mount(<LocatedTableViewer tableId={TABLE} />);
    expect(container.querySelector('[data-testid="older-grid"]')).not.toBeNull();
    expect(container.querySelector("[data-table-store-notice]")).toBeNull();
  });
});
