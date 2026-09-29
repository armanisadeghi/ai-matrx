/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
  }),
}));

jest.mock("@ai-matrx/kit/url-state", () => ({
  enumUrlCodec: jest.fn(),
  jsonUrlCodec: jest.fn(),
  stringUrlCodec: (fallback: string) => ({ fallback }),
  useUrlState: (key: string, codec?: { fallback?: string }) => {
    const values: Record<string, string | Record<string, never>> = {
      q: codec?.fallback ?? "",
      f: {},
      sort: "id",
      dir: "asc",
    };
    return [values[key] ?? "", jest.fn()];
  },
}));

jest.mock("@/features/administration/kg-inspector/components/KgInspectorColumnHeader", () => ({
  KgInspectorColumnHeader: () => null,
  KgSortIcon: () => null,
}));
jest.mock("@/features/administration/kg-inspector/components/ValueListFilterPopover", () => ({
  ValueListFilterPopover: () => null,
}));
jest.mock("@/components/read-state/ReadFailure", () => ({
  ReadFailure: () => <div role="alert">Read failed</div>,
}));

type Row = { id: string };

const columns: AuditColumnDef<Row>[] = [
  { key: "id", label: "ID", type: "text", getValue: (row) => row.id },
];

describe("AdminAuditTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the package footer as an all-loaded receipt without slicing virtual rows", () => {
    act(() => {
      root.render(
        <AdminAuditTable
          rows={[{ id: "match-one" }, { id: "match-two" }, { id: "other" }]}
          columns={columns}
          initialSearch="match"
        />,
      );
    });

    const footer = host.querySelector("[data-matrx-table-footer]");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("2 shown / 3 loaded");
    expect(
      (host.querySelector('[aria-label="Rows per page"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (host.querySelector('[aria-label="Previous page"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (host.querySelector('[aria-label="Next page"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it.each([
    ["loading", { loading: true }, null],
    ["failed", { error: new Error("read failed") }, "failed"],
  ] as const)(
    "keeps the footer present and does not invent a zero count while %s",
    (_state, props, expectedUnavailable) => {
      act(() => {
        root.render(<AdminAuditTable rows={[]} columns={columns} {...props} />);
      });

      const footer = host.querySelector("[data-matrx-table-footer]");
      expect(footer).not.toBeNull();
      expect(footer?.textContent).not.toContain("0 rows");
      if (expectedUnavailable) {
        expect(footer?.textContent).toContain("—");
        expect(
          footer?.querySelector('[aria-label="Row count unavailable"]'),
        ).not.toBeNull();
      } else {
        expect(
          footer?.querySelector('[aria-label="Row count unavailable"]'),
        ).toBeNull();
      }
    },
  );
});
