/**
 * Regression lock for QA F2 (feedback dc739d98): a durable AUTHENTICATED
 * byte-endpoint URL (`{base}/files/{id}/download?inline=1`,
 * `{base}/media/{id}/v/{class}`) is one of OUR files — its identity is the
 * file_id, and treating it as an opaque external URL breaks every consumer
 * that must attach auth (the annotate canvas fetched it with no
 * Authorization header and got refused bytes).
 */
import {
  fileIdFromFileEndpointUrl,
  recognizeOurFileUrl,
} from "@/lib/media/our-file-sources";

const FILE_ID = "e57d04c1-8c0d-41c4-aa40-476ea19b3782";

describe("fileIdFromFileEndpointUrl", () => {
  it("recovers the file_id from the files-host download endpoint", () => {
    expect(
      fileIdFromFileEndpointUrl(
        `https://files.matrxserver.com/files/${FILE_ID}/download?inline=1`,
      ),
    ).toBe(FILE_ID);
  });

  it("recovers the file_id from the main-backend download endpoint", () => {
    expect(
      fileIdFromFileEndpointUrl(
        `https://server.app.matrxserver.com/files/${FILE_ID}/download`,
      ),
    ).toBe(FILE_ID);
  });

  it("recovers the file_id from a media variant endpoint", () => {
    expect(
      fileIdFromFileEndpointUrl(
        `https://files.matrxserver.com/media/${FILE_ID}/v/thumb`,
      ),
    ).toBe(FILE_ID);
  });

  it("recovers the file_id from a localhost dev backend", () => {
    expect(
      fileIdFromFileEndpointUrl(
        `http://localhost:8000/files/${FILE_ID}/download?inline=1`,
      ),
    ).toBe(FILE_ID);
  });

  it("refuses the same path shape on a foreign host", () => {
    expect(
      fileIdFromFileEndpointUrl(
        `https://evil.example.com/files/${FILE_ID}/download`,
      ),
    ).toBeNull();
  });

  it("refuses non-endpoint paths and non-UUID ids on our host", () => {
    expect(
      fileIdFromFileEndpointUrl("https://files.matrxserver.com/files/session"),
    ).toBeNull();
    expect(
      fileIdFromFileEndpointUrl(
        "https://files.matrxserver.com/files/not-a-uuid/download",
      ),
    ).toBeNull();
  });
});

describe("recognizeOurFileUrl — authenticated byte endpoints", () => {
  it("promotes the files-host download URL to a file_id source", () => {
    const match = recognizeOurFileUrl(
      `https://files.matrxserver.com/files/${FILE_ID}/download?inline=1`,
    );
    expect(match).not.toBeNull();
    expect(match!.origin).toBe("files-endpoint");
    expect(match!.fileId).toBe(FILE_ID);
    expect(match!.source).toEqual({ kind: "file_id", fileId: FILE_ID });
    expect(match!.durableUrl).toBe(true);
  });
});
