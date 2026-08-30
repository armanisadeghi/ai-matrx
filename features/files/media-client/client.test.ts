/**
 * Regression lock for QA F2 (feedback dc739d98): the MediaClient must treat a
 * pasted AUTHENTICATED byte-endpoint URL
 * (`https://files.matrxserver.com/files/{id}/download?inline=1`) as the
 * file_id it names — never as an opaque external URL. The external lane has
 * no Authorization header and no session cookie guarantee, so /images/annotate
 * (crossOrigin canvas) got refused bytes and rendered the error panel.
 */

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => null,
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { use: jest.fn(), upload: jest.fn() },
}));
jest.mock("@/features/files/handler/session", () => ({
  ensureFilesSession: jest.fn(async () => {}),
}));
jest.mock("@/features/files/upload/UploadGuardHost", () => ({
  requestUpload: jest.fn(),
}));
jest.mock("@/features/files/redux/thunks", () => ({
  createShareLink: jest.fn(),
  ensureCloudFileFields: jest.fn(),
  loadShareLinks: jest.fn(),
}));
jest.mock("@/features/files/hooks/blob-cache", () => ({
  getCached: jest.fn(() => null),
  hydrateFromIdb: jest.fn(async () => null),
  setCached: jest.fn(),
}));
jest.mock("@/features/files/api/files", () => ({
  downloadFileWithProgress: jest.fn(async () => ({
    blob: new Blob(["png-bytes"], { type: "image/png" }),
    filename: "download.png",
    meta: {},
  })),
}));
jest.mock("@/features/files/handler/utils/python-base", () => ({
  fileUrls: (fileId: string) => ({
    download: `https://files.matrxserver.com/files/${fileId}/download`,
    inline: `https://files.matrxserver.com/files/${fileId}/download?inline=1`,
  }),
  pythonShareUrl: (token: string) =>
    `https://files.matrxserver.com/share/${token}`,
}));

import { mediaClient } from "./client";
import * as Files from "@/features/files/api/files";

const FILE_ID = "e57d04c1-8c0d-41c4-aa40-476ea19b3782";
const ENDPOINT_URL = `https://files.matrxserver.com/files/${FILE_ID}/download?inline=1`;

// URL.createObjectURL does not exist in jsdom.
beforeAll(() => {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      value: jest.fn(() => `blob:jest/${Math.random()}`),
      writable: true,
    });
  }
});

describe("mediaClient.resolve — authenticated endpoint URL promotion (F2)", () => {
  it("resolves the pasted endpoint URL through the private file_id lane", () => {
    const resolution = mediaClient.resolve(ENDPOINT_URL);
    expect(resolution).not.toBeNull();
    // Private/unknown-visibility image pixels ride the blob transport, so
    // canvas/crossOrigin consumers get bearer-authenticated bytes.
    expect(resolution!.transport).toBe("blob");
    expect(resolution!.recoverable).toBe(true);
    expect(String(resolution!.src)).toBe(ENDPOINT_URL);
  });

  it("keeps a genuinely foreign URL on the external element lane", () => {
    const resolution = mediaClient.resolve(
      "https://example.com/some-image.png",
    );
    expect(resolution).not.toBeNull();
    expect(resolution!.transport).toBe("element");
    expect(resolution!.recoverable).toBe(false);
  });
});

describe("mediaClient.getBlob — authenticated endpoint URL promotion (F2)", () => {
  it("downloads bytes via the authenticated file_id download, not a bare fetch", async () => {
    const handle = await mediaClient.getBlob(ENDPOINT_URL);
    expect(Files.downloadFileWithProgress).toHaveBeenCalledWith(
      FILE_ID,
      expect.any(Function),
    );
    expect(handle.blob.type).toBe("image/png");
    expect(handle.url.startsWith("blob:")).toBe(true);
  });
});
