/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ResearchSource } from "../../types";
import { SourceResultsTable } from "./SourceResultsTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../../hooks/useResearchState", () => ({
  useYouTubeVideoIndex: () => ({ identityFor: () => null }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name: string }) => <span>{name}</span>,
}));
jest.mock("../shared/StatusBadge", () => ({
  StatusBadge: () => null,
}));
jest.mock("../shared/SourceTypeIcon", () => ({
  SourceTypeIcon: () => null,
}));
jest.mock("./RedundancyGroupBadge", () => ({
  RedundancyGroupBadge: () => null,
}));
jest.mock("./ScrapeWorthinessFlag", () => ({
  ScrapeWorthinessFlag: () => null,
}));
jest.mock("./sourceScoreDisplay", () => ({
  ScoreCell: () => null,
  sourceScoreValues: () => ({}),
  QUALITY_SCORE_LABEL: "Quality",
  PRIORITY_SCORE_LABEL: "Priority",
  POST_READ_SCORE_LABEL: "Post-read",
  AUTH_SCORE_LABEL: "Authority",
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

describe("SourceResultsTable preview footer", () => {
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

  it("renders the canonical source receipt with only inert all-loaded pagination", () => {
    act(() => {
      root.render(
        <SourceResultsTable
          sources={[source]}
          topicId="topic-1"
          rankFor={() => 1}
        />,
      );
    });

    const footer = host.querySelector("[data-matrx-table-footer]");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("1 source shown");
    expect(
      footer?.querySelector('[aria-label="Rows per page"]')?.textContent,
    ).toContain("All loaded");
    expect(
      footer?.querySelector('[aria-label="Previous page"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      footer?.querySelector('[aria-label="Next page"]')?.hasAttribute("disabled"),
    ).toBe(true);
  });
});
