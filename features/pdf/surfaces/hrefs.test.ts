import { buildPdfExtractorHref, buildSourceHref } from "./hrefs";

describe("buildPdfExtractorHref", () => {
  it("a control labelled PDF Extractor opens the PDF tools on that document, never Knowledge", () => {
    // The Source screen is the document's home (SOURCE-CONVERGENCE §8.2), but
    // the PDF tools stay at /tools/pdf-extractor?doc=<id>. Routing this to
    // /knowledge/sources sent every "Open in PDF Extractor" to Knowledge.
    expect(
      buildPdfExtractorHref({
        fileId: "file-id",
        processedDocumentId: "document-id",
      }),
    ).toBe("/tools/pdf-extractor?doc=document-id");
    expect(
      buildPdfExtractorHref({ fileId: null, processedDocumentId: "a/b c" }),
    ).toBe("/tools/pdf-extractor?doc=a%2Fb%20c");
  });

  it("the Source link opens this document's Source screen", () => {
    expect(
      buildSourceHref({ fileId: "f", processedDocumentId: "document-id" }),
    ).toBe("/knowledge/sources/document-id");
    expect(buildSourceHref({ fileId: "f", processedDocumentId: null })).toBeNull();
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
