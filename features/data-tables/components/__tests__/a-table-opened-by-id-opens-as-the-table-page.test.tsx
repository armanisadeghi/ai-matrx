/**
 * A TABLE OPENED BY ID OPENS AS THE TABLE PAGE — THE SAME COMPONENT /data/<table> MOUNTS.
 *
 * `LocatedTableViewer` is the one door every host outside the table page opens a table by id
 * through (the table window, the dataset overlay, a chat table artifact, the quick data sheet, the
 * tables picker, the chat "view table" modal). It mounts `useUnifiedTable` + `UnifiedTableBody`
 * (lane CHAIR-ONE-GRID): a host's own action entries and a preview's read-only reach that one
 * mount, never a second host binding.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hookArgs: Array<Record<string, unknown>> = [];
const bodyMounts: Array<Record<string, unknown>> = [];
jest.mock("@/features/unified-data/table-page/UnifiedTable", () => ({
  NO_ADDRESS: { dashboard: null },
  useUnifiedTable: (args: Record<string, unknown>) => {
    hookArgs.push(args);
    return { tableId: args.tableId, mergedGrid: true };
  },
  UnifiedTableBody: ({ mount }: { mount: Record<string, unknown> }) => {
    bodyMounts.push(mount);
    return <div data-testid="table-page" />;
  },
}));

import LocatedTableViewer from "../LocatedTableViewer";

const TABLE = "3260bbbe-0000-4000-8000-000000000001";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  hookArgs.length = 0;
  bodyMounts.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LocatedTableViewer", () => {
  it("mounts the /data table page's own body, with the host's action entries", async () => {
    const extras: ObjectAction[] = [{ id: "window", label: "Open in a floating window", icon: "external-link", group: "open", run: () => undefined }];
    await act(async () => root.render(<LocatedTableViewer tableId={TABLE} actionExtensions={extras} />));
    expect(container.querySelector('[data-testid="table-page"]')).not.toBeNull();
    expect(hookArgs[0]).toMatchObject({ tableId: TABLE, actionExtensions: extras, readOnly: false });
    expect(bodyMounts[0]).toMatchObject({ tableId: TABLE });
    expect(container.querySelector(`[data-record-store-table="${TABLE}"]`)?.getAttribute("data-grid")).toBe("merged");
  });

  it("a picker preview binds the one mount read-only", async () => {
    await act(async () => root.render(<LocatedTableViewer tableId={TABLE} readOnly />));
    expect(hookArgs[0]).toMatchObject({ tableId: TABLE, readOnly: true });
    expect(container.querySelector('[data-read-only="preview"]')).not.toBeNull();
  });
});
