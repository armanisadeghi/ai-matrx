/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { ChooserBucketsManager } from "./ChooserBucketsManager";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tables: MatrxDataTableProps<unknown>[] = [];
const rpc = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<unknown>) => {
    tables.push(props);
    return null;
  },
}));

jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

describe("ChooserBucketsManager", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tables = [];
    rpc.mockReset();
    rpc.mockImplementation((name: string) => {
      if (name === "reference_categories_list") {
        return Promise.resolve({
          data: [
            {
              slug: "status",
              label: "Status",
              sort_order: 10,
              is_active: true,
            },
          ],
          error: null,
        });
      }
      if (name === "entity_schemas_list") {
        return Promise.resolve({
          data: [
            {
              schema_name: "crm",
              display_name: "CRM",
              sort_order: 20,
              is_active: false,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ error: null });
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses two canonical compact tables and preserves the vocabulary write contracts", async () => {
    await act(async () => {
      root.render(<ChooserBucketsManager />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const categoryTable = tables.findLast(
      (table) => table.urlState?.id === "chooser-slug",
    );
    const schemaTable = tables.findLast(
      (table) => table.urlState?.id === "chooser-schema",
    );
    if (!categoryTable || !schemaTable)
      throw new Error("Tables did not render");

    expect(categoryTable.density).toBe("condensed");
    expect(categoryTable.toolbar?.title).toBe("Reference categories");
    expect(categoryTable.toolbar?.add).toBeDefined();
    expect(schemaTable.toolbar?.add).toBeUndefined();
    expect(categoryTable.columns.map((column) => column.id)).toEqual([
      "key",
      "label",
      "sort_order",
      "is_active",
    ]);
    expect(
      categoryTable.columns.find((column) => column.id === "label")?.editable,
    ).toBe("string");
    expect(
      categoryTable.columns.find((column) => column.id === "sort_order")
        ?.editable,
    ).toBe("number");
    expect(
      categoryTable.columns.find((column) => column.id === "is_active")
        ?.editable,
    ).toBe("boolean");

    await act(async () => {
      await categoryTable.edit?.onSave(
        { status: { label: "Lifecycle", sort_order: 30, is_active: false } },
        [],
      );
    });
    expect(rpc).toHaveBeenCalledWith("admin_upsert_reference_category", {
      p_slug: "status",
      p_label: "Lifecycle",
      p_sort_order: 30,
      p_is_active: false,
    });
  });
});
