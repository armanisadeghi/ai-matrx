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

describe("multi-service file routing", () => {
  // Route ownership is unconditional — no env gate, no environment argument.
  // A standalone-owned route ALWAYS goes to matrx-files; which host answers is
  // resolveFilesBaseUrl's job. Any reintroduced toggle should fail these.
  it("sends a standalone-owned route to matrx-files", () => {
    expect(
      shouldRouteBrowserRequestToStandaloneFiles("/files/upload", "POST"),
    ).toBe(true);
  });

  it("leaves a route the service does not own on aidream", () => {
    expect(
      shouldRouteBrowserRequestToStandaloneFiles("/ai/chat", "POST"),
    ).toBe(false);
  });

  it("takes no environment or override argument", () => {
    expect(shouldRouteBrowserRequestToStandaloneFiles.length).toBe(2);
  });
});
