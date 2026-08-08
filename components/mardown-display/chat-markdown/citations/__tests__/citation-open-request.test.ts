/**
 * Unit guard for citation click-through targets (citation-open-request.ts):
 * the pure builder behind `useOpenCitationSource`. The load-bearing case is
 * the `search_result` path — a RAG/document_search citation with our
 * file_id + page (url null) MUST open the Source Inspector at the exact page.
 */

import {
  citationOpenRequest,
  citationSourceIsOpenable,
} from "../citation-open-request";
import type { MessageCitationSource } from "@/features/agents/redux/execution-system/messages/message-citations";

function source(
  over: Partial<MessageCitationSource> = {},
): MessageCitationSource {
  return {
    number: 1,
    kind: "search_result",
    provider: "anthropic",
    title: "Q3 Report.pdf",
    url: null,
    fileId: "file-sr-1",
    page: 7,
    endPage: null,
    citedText: "quoted passage",
    count: 1,
    ...over,
  };
}

describe("citationOpenRequest", () => {
  it("search_result with file_id + page → Source Inspector (cld_file) at that page", () => {
    const req = citationOpenRequest(source());
    expect(req).toEqual({
      sourceKind: "cld_file",
      sourceId: "file-sr-1",
      href: "/files/f/file-sr-1?tab=document&page=7",
      chunkId: null,
      pageNumber: 7,
      pageNumbers: [7],
      snippet: "quoted passage",
      fileName: "Q3 Report.pdf",
    });
  });

  it("file_id without page omits the page param and page numbers", () => {
    const req = citationOpenRequest(source({ page: null }));
    expect(req?.href).toBe("/files/f/file-sr-1?tab=document");
    expect(req?.pageNumber).toBeNull();
    expect(req?.pageNumbers).toBeNull();
  });

  it("fileId wins over url — our file at the exact page beats the web fallback", () => {
    const req = citationOpenRequest(source({ url: "https://example.com/x" }));
    expect(req?.sourceKind).toBe("cld_file");
  });

  it("url-only source → web open request", () => {
    const req = citationOpenRequest(
      source({ kind: "web", fileId: null, page: null, url: "https://x.com/a" }),
    );
    expect(req).toEqual({
      sourceKind: "web",
      sourceId: "https://x.com/a",
      href: "https://x.com/a",
      snippet: "quoted passage",
      fileName: "Q3 Report.pdf",
    });
  });

  it("no file_id and no url → null (not openable)", () => {
    const bare = source({ fileId: null, url: null });
    expect(citationOpenRequest(bare)).toBeNull();
    expect(citationSourceIsOpenable(bare)).toBe(false);
    expect(citationSourceIsOpenable(source())).toBe(true);
  });
});
