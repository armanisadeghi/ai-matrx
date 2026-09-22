/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
  MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { DirectiveCatalogGrid } from "./DirectiveCatalogGrid";
import type {
  DirectiveCatalog,
  NounDirectives,
} from "@/features/directive-catalog/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<NounDirectives> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<NounDirectives>) => {
    tableProps = props;
    return <div>{props.toolbar?.leading}</div>;
  },
}));

jest.mock("@/features/directive-catalog/components/StateCell", () => ({
  StateBadge: ({ state }: { state: string }) => <span>{state}</span>,
  StateCell: () => null,
}));

const catalog = {
  nouns: [
    {
      noun: "document",
      table: "documents",
      family: "content",
      reference: "yes",
      view: "yes",
      create: "yes",
      update: "planned",
      delete: "no",
    },
    {
      noun: "workspace",
      table: "workspaces",
      family: "platform",
      reference: "no",
      view: "yes",
      create: "no",
      update: "no",
      delete: "no",
    },
  ],
  actions: [
    {
      slug: "publish-document",
      name: "publish_document",
      doc: "Publish a document",
    },
  ],
} as DirectiveCatalog;

describe("DirectiveCatalogGrid", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("supplies the full noun matrix to the canonical grouped table", () => {
    act(() => {
      root.render(
        <DirectiveCatalogGrid
          catalog={catalog}
          busyToggle={null}
          onToggleWritable={jest.fn()}
          onInspect={jest.fn()}
        />,
      );
    });

    if (!tableProps) throw new Error("Directive table did not render");
    expect(tableProps.data).toHaveLength(2);
    expect(tableProps.getRowId(catalog.nouns[0])).toBe("document");
    expect(tableProps.defaultSort).toEqual({ id: "noun", direction: "asc" });
    expect(tableProps.grouping).toMatchObject({
      columnId: "family",
      groupableColumnIds: ["family"],
      order: "value-asc",
    });
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.hidePagination).toBe(true);
    expect(tableProps.toolbar?.search).toBe(false);

    const columns = tableProps.columns as MatrxColumnDef<NounDirectives>[];
    expect(columns.map((column) => column.id)).toEqual([
      "noun",
      "table",
      "family",
      "reference",
      "view",
      "create",
      "update",
      "delete",
    ]);
    expect(columns.find((column) => column.id === "family")?.hidden).toBe(true);
  });
});
