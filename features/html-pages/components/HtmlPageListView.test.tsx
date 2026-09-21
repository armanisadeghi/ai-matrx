/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { HtmlPageSummary } from "@/features/html-pages/types";
import HtmlPageListView from "./HtmlPageListView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<HtmlPageSummary> | null = null;
const replace = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<HtmlPageSummary>) => {
    tableProps = props;
    return null;
  },
}));
jest.mock("@ai-matrx/design-system/data-table/uuid-cell", () => ({
  MatrxUuidCell: () => null,
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/cms/html-pages",
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () =>
    new URLSearchParams("q=launch&sort=meta_title&dir=asc"),
}));
jest.mock("./HtmlPagesContextMenu", () => ({
  HtmlPagesContextMenu: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("./PromoteToSiteDialog", () => ({ PromoteToSiteDialog: () => null }));

const page: HtmlPageSummary = {
  id: "12345678-1234-1234-1234-123456789abc",
  meta_title: "Launch page",
  meta_description: "A real page",
  meta_keywords: "launch",
  og_image: null,
  canonical_url: null,
  is_indexable: true,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  artifact_id: null,
  source_message_id: null,
  source_conv_id: null,
  url: "https://example.com/launch",
};

describe("HtmlPageListView", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    replace.mockClear();
    window.history.replaceState(
      null,
      "",
      "/cms/html-pages?q=launch&sort=meta_title&dir=asc",
    );
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the URL-owned page query and every sortable/filterable source value in the canonical table", () => {
    act(() => {
      root.render(
        <HtmlPageListView
          pages={[page]}
          isLoading={false}
          error={null}
          onOpenPage={jest.fn()}
          onCreatePage={jest.fn()}
          onDeletePage={jest.fn()}
          onRefresh={jest.fn()}
        />,
      );
    });
    if (!tableProps) throw new Error("HTML pages table did not render");

    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "id",
      "meta_title",
      "meta_description",
      "is_indexable",
      "updated_at",
      "created_at",
      "meta_keywords",
      "url",
    ]);
    expect(tableProps.query).toMatchObject({
      mode: "controlled-local",
      state: { search: "launch", sort: { id: "meta_title", direction: "asc" } },
      sourceProcessing: { search: "source" },
    });
    expect(tableProps.toolbar).toMatchObject({ title: "Published pages" });
    expect(tableProps.toolbar?.add?.onAdd).toBeDefined();
    expect(tableProps.coverage).toEqual({
      noun: "published page",
      answeredBy: "client",
      total: 1,
    });
    expect(tableProps.copy).toBe(false);

    if (tableProps.query?.mode !== "controlled-local") {
      throw new Error(
        "HTML pages table did not expose controlled local query state",
      );
    }
    const controlledQuery = tableProps.query;

    act(() => {
      controlledQuery.onStateChange({
        page: 1,
        pageSize: 25,
        search: "description",
        anyOf: "",
        columnFilters: {},
        sort: { id: "meta_description", direction: "desc" },
      });
    });
    expect(replace).toHaveBeenLastCalledWith(
      "/cms/html-pages?q=description&sort=meta_description",
      { scroll: false },
    );

    const facet = tableProps.toolbar?.facets?.[0];
    if (!facet || facet.type !== "button-group") {
      throw new Error("Indexable facet is missing");
    }
    replace.mockClear();
    act(() => {
      facet.onChange("indexable");
      controlledQuery.onStateChange({
        page: 1,
        pageSize: 25,
        search: "launch",
        anyOf: "",
        columnFilters: {},
        sort: { id: "meta_title", direction: "asc" },
      });
    });
    expect(replace).toHaveBeenLastCalledWith(
      "/cms/html-pages?q=launch&ix=1&sort=meta_title&dir=asc",
      { scroll: false },
    );
  });

  it("keeps the canonical Add control mounted for an empty table view", () => {
    act(() => {
      root.render(
        <HtmlPageListView
          pages={[]}
          isLoading={false}
          error={null}
          onOpenPage={jest.fn()}
          onCreatePage={jest.fn()}
          onDeletePage={jest.fn()}
          onRefresh={jest.fn()}
        />,
      );
    });
    if (!tableProps) throw new Error("Empty HTML pages table did not render");
    expect(tableProps.toolbar?.add?.onAdd).toBeDefined();
    expect(tableProps.emptyState?.title).toBe("No published pages yet");
  });
});
