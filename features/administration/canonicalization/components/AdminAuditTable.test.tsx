/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
  configurable: true,
});

type Row = { id: string; status: string };

const columns: AuditColumnDef<Row>[] = [
  { key: "id", label: "ID", type: "text", getValue: (row) => row.id },
  { key: "status", label: "Status", type: "enum", getValue: (row) => row.status },
];

const rows: Row[] = [
  { id: "match-one", status: "FAIL" },
  { id: "match-two", status: "PASS" },
  { id: "other", status: "PASS" },
];

describe("AdminAuditTable on MatrxDataTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState({}, "", "/audit");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("a deep-linked initialSearch narrows the rows", async () => {
    await act(async () => {
      root.render(
        <AdminAuditTable rows={rows} columns={columns} initialSearch="match" />,
      );
    });
    expect(host.textContent).toContain("match-one");
    expect(host.textContent).toContain("match-two");
    expect(host.textContent).not.toContain("other");
  });

  it("deep-linked initialColumnFilters (exact values) narrow the rows", async () => {
    await act(async () => {
      root.render(
        <AdminAuditTable
          rows={rows}
          columns={columns}
          initialColumnFilters={{ status: { enumValues: ["FAIL"] } }}
        />,
      );
    });
    expect(host.textContent).toContain("match-one");
    expect(host.textContent).not.toContain("match-two");
    expect(host.textContent).not.toContain("other");
  });

  it("a failed read shows the failure, never an empty-rows message", async () => {
    await act(async () => {
      root.render(
        <AdminAuditTable
          rows={[]}
          columns={columns}
          error={new Error("read failed")}
          emptyMessage="No rows at all."
        />,
      );
    });
    expect(host.textContent).not.toContain("No rows at all.");
  });
});
