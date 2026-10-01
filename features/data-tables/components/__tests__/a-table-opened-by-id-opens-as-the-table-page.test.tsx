/**
 * A TABLE OPENED BY ID OPENS AS THE TABLE PAGE, IN ITS OWN ORGANIZATION.
 *
 * `LocatedTableViewer` is the one door every host outside the table page opens a table by id
 * through (the table window, the dataset overlay, a chat table artifact, the quick data sheet, the
 * tables picker, the chat "view table" modal). It locates the table and mounts records-ui's table
 * page through the one shared host binding (`RecordStoreTableHost`), in the table's own
 * organization; a table it cannot open is said in words.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const locateTable = jest.fn();
jest.mock("@/features/data-tables/data-source/locate-table", () => ({
  locateTable: (...args: unknown[]) => locateTable(...args),
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

const TABLE = "3260bbbe-0000-4000-8000-000000000001";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

let container: HTMLDivElement;
let root: Root;

/** Mount, then let the located answer land. */
async function mount(node: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
}
const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`);

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  locateTable.mockReset();
  hostProps.length = 0;
});

describe("LocatedTableViewer", () => {
  it("mounts records-ui's table page in the table's own organization", async () => {
    locateTable.mockResolvedValue({ ok: true, store: "record", home: { store: "record", organizationId: ORG, userId: "u" } });
    const extras = [{ key: "w", label: "Open in a floating window", onSelect: () => undefined }];
    await mount(<LocatedTableViewer tableId={TABLE} recordStoreMenuExtras={extras} />);
    expect(byTestId("records-ui-table")).not.toBeNull();
    expect(hostProps[0]).toMatchObject({ tableId: TABLE, organizationId: ORG, menuExtras: extras });
  });

  it("says a refusal in words, mounting no table", async () => {
    locateTable.mockResolvedValue({ ok: false, error: "This table has not been shared with you." });
    await mount(<LocatedTableViewer tableId={TABLE} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("not been shared");
    expect(hostProps).toHaveLength(0);
  });
});
