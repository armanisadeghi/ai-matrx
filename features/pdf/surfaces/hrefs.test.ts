import { buildPdfExtractorHref } from "./hrefs";

describe("buildPdfExtractorHref", () => {
  it("opens an existing processed document directly, on THE Source screen", () => {
    // Every old viewer route, /tools/pdf-extractor/[id] included, redirects to
    // /knowledge/sources/<processed_document_id> (SOURCE-CONVERGENCE §8.2).
    expect(
      buildPdfExtractorHref({
        fileId: "file-id",
        processedDocumentId: "document-id",
      }),
    ).toBe("/knowledge/sources/document-id");
    expect(
      buildPdfExtractorHref({ fileId: null, processedDocumentId: "a/b c" }),
    ).toBe("/knowledge/sources/a%2Fb%20c");
  });

  it("preserves an unprocessed cloud file id", () => {
    expect(
      buildPdfExtractorHref({
        fileId: "file/id with spaces",
        processedDocumentId: null,
      }),
    ).toBe("/tools/pdf-extractor?file=file%2Fid%20with%20spaces");
  });

  it("falls back to the extractor home without either identity", () => {
    expect(
      buildPdfExtractorHref({ fileId: null, processedDocumentId: null }),
    ).toBe("/tools/pdf-extractor");
  });
});
