/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { ResearchSource } from "../../types";
import { SourceResultsTable } from "./SourceResultsTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<ResearchSource> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<ResearchSource>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../../hooks/useResearchState", () => ({
  useYouTubeVideoIndex: () => ({ identityFor: () => null }),
}));
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  ExternalLinkTapButton: () => null,
}));

const source = {
  id: "source-1",
  title: "A source",
  hostname: "example.com",
  url: "https://example.com",
  source_type: "website",
  scrape_status: "success",
  authority_score: 74,
  pre_read_score: 42,
  post_read_score: 51,
  final_source_score: 68,
} as ResearchSource;

describe("SourceResultsTable", () => {
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

  it("keeps the preview pre-ranked and removes every query control", () => {
    act(() => {
      root.render(
        <SourceResultsTable
          sources={[source]}
          topicId="topic-1"
          rankFor={() => 2}
        />,
      );
    });
    if (!tableProps) throw new Error("Source table did not render");

    expect(tableProps.hideToolbar).toBe(true);
    expect(tableProps.hidePagination).toBe(true);
    expect(tableProps.copy).toBe(false);
    expect(
      tableProps.columns.every(
        (column) => column.sortable === false && column.filter === false,
      ),
    ).toBe(true);
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "rank",
      "source",
      "search",
      "scrape",
      "priority",
      "authority",
      "post",
      "verdict",
    ]);
  });

  it("declares every interactive source field and the canonical source door", () => {
    act(() => {
      root.render(
        <SourceResultsTable
          interactive
          sources={[source]}
          topicId="topic-1"
          rankFor={() => 2}
          dataSizeFor={() => 1234}
          analysisFor={() => "content"}
          sourceSearch="source"
        />,
      );
    });
    if (!tableProps) throw new Error("Source table did not render");

    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "rank",
      "source",
      "search",
      "scrape",
      "priority",
      "authority",
      "post",
      "verdict",
      "type",
      "video-channel",
      "video-duration",
      "video-views",
      "video-subscribers",
      "video-processing",
      "analysis",
      "characters",
      "hostname",
      "source-id",
    ]);
    const sourceColumn = tableProps.columns.find(
      (column) => column.id === "source",
    );
    const analysisColumn = tableProps.columns.find(
      (column) => column.id === "analysis",
    );
    expect(sourceColumn?.filter).toBe("text");
    expect(tableProps.getRowHref?.(source)).toBe(
      "/research/topics/topic-1/sources/source-1",
    );
    expect(analysisColumn?.sortValue?.(source)).toBe(3);
    expect(tableProps.query).toMatchObject({
      mode: "controlled-local",
      sourceProcessing: { search: "source" },
    });
    expect(tableProps.toolbar?.title).toBe("Content");
  });
});
