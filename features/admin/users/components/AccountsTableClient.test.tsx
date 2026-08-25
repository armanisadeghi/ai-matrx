/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@/components/official/matrx-data-table/types";
import type { AdminUserRow } from "../types";
import { AccountsTableClient } from "./AccountsTableClient";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mockTableProps: MatrxDataTableProps<AdminUserRow> | null = null;

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/users",
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock(
  "@/components/official/matrx-data-table/MatrxDataTable",
  () => ({
    MatrxDataTable: (props: MatrxDataTableProps<AdminUserRow>) => {
      mockTableProps = props;
      return null;
    },
  }),
);

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: ReactNode }) => children,
}));

describe("AccountsTableClient", () => {
  let host: HTMLDivElement;
  let root: Root;
  let fetchDescriptor: PropertyDescriptor | undefined;
  let matchMediaDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/administration/users");
    mockTableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [] }),
      }),
    });
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "matchMedia",
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (fetchDescriptor) {
      Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
    jest.restoreAllMocks();
  });

  it("gives controlled-local query state a single URL-backed owner", async () => {
    await act(async () => {
      root.render(<AccountsTableClient />);
    });

    if (!mockTableProps) throw new Error("Accounts table did not render");
    const tableProps = mockTableProps;
    expect(tableProps.urlState).toBeUndefined();
    expect(tableProps.query?.mode).toBe("controlled-local");

    if (!tableProps.query || tableProps.query.mode === "local") {
      throw new Error("Accounts query is not controlled");
    }

    act(() => {
      tableProps.query?.mode !== "local" &&
        tableProps.query?.onStateChange({
          ...tableProps.query.state,
          search: "gmail",
        });
    });

    expect(window.location.search).toContain(
      "table.user-accounts.q=gmail",
    );
  });
});
