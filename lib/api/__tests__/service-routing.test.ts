import {
  isStandaloneFileServiceRoute,
  shouldRouteBrowserRequestToStandaloneFiles,
} from "@/lib/api/service-routing";

const FILE_ID = "3e031c3f-b1e3-425c-ac49-217ad074b1d5";

describe("isStandaloneFileServiceRoute", () => {
  it.each([
    `/files/${FILE_ID}`,
    `/files/${FILE_ID}/url?expires_in=3600`,
    `/files/${FILE_ID}/asset?signed_url_ttl=3600`,
    `/files/${FILE_ID}/download?inline=true`,
    `/files/${FILE_ID}/share-links`,
    "/files/upload",
    "/files/bulk",
    "/assets/presets",
    `/assets/${FILE_ID}`,
    "/share/public-token/download",
  ])("routes %s to matrx-files", (path) => {
    expect(isStandaloneFileServiceRoute(path)).toBe(true);
  });

  it.each([
    `/files/${FILE_ID}/ingest`,
    `/files/${FILE_ID}/rag-status`,
    `/files/${FILE_ID}/search`,
    `/files/${FILE_ID}/versions`,
    `/assets/${FILE_ID}/variants`,
    "/rag/ingest/stream",
    "/ai/conversations/example",
  ])("leaves aidream-owned route %s on aidream", (path) => {
    expect(isStandaloneFileServiceRoute(path)).toBe(false);
  });

  it.each([
    ["POST", `/files/${FILE_ID}/asset`],
    ["PATCH", `/assets/${FILE_ID}`],
    ["GET", "/files/upload"],
  ])("keeps unsupported %s %s on aidream", (method, path) => {
    expect(isStandaloneFileServiceRoute(path, method)).toBe(false);
  });
});

describe("shouldRouteBrowserRequestToStandaloneFiles", () => {
  const originalCutover = process.env.NEXT_PUBLIC_FILES_BROWSER_CUTOVER;

  afterEach(() => {
    if (originalCutover === undefined) {
      delete process.env.NEXT_PUBLIC_FILES_BROWSER_CUTOVER;
    } else {
      process.env.NEXT_PUBLIC_FILES_BROWSER_CUTOVER = originalCutover;
    }
  });

  it("keeps browser file uploads on aidream before cutover", () => {
    delete process.env.NEXT_PUBLIC_FILES_BROWSER_CUTOVER;

    expect(
      shouldRouteBrowserRequestToStandaloneFiles("/files/upload", "POST"),
    ).toBe(false);
  });

  it("routes owned file endpoints after the explicit browser cutover", () => {
    process.env.NEXT_PUBLIC_FILES_BROWSER_CUTOVER = "true";

    expect(
      shouldRouteBrowserRequestToStandaloneFiles("/files/upload", "POST"),
    ).toBe(true);
    expect(
      shouldRouteBrowserRequestToStandaloneFiles(
        `/files/${FILE_ID}/pdf-pages`,
        "POST",
      ),
    ).toBe(true);
    expect(
      shouldRouteBrowserRequestToStandaloneFiles(
        `/files/${FILE_ID}/ingest`,
        "POST",
      ),
    ).toBe(false);
  });
});
