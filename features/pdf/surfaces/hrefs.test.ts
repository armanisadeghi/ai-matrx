import { buildPdfExtractorHref } from "./hrefs";

describe("buildPdfExtractorHref", () => {
  it("opens an existing processed document directly", () => {
    expect(
      buildPdfExtractorHref({
        fileId: "file-id",
        processedDocumentId: "document-id",
      }),
    ).toBe("/tools/pdf-extractor/document-id");
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
