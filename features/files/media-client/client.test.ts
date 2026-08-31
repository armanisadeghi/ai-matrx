/**
 * Host smoke for the C9 collapse: the app's construction of
 * `@ai-matrx/data/files` (the REAL package — nothing package-side is mocked)
 * must preserve the media 0.2.2/0.2.3 parity items:
 *
 *   - QA F2 (feedback dc739d98): a pasted AUTHENTICATED byte-endpoint URL
 *     (`…/files/{id}/download?inline=1`) is the file_id it names — promoted
 *     to the blob lane, never treated as an opaque external URL;
 *   - the transport decision: private pixels ride the bearer-authenticated
 *     blob lane; foreign URLs stay on the element lane, unrecoverable.
 *
 * Only HOST identity is mocked (bases, Redux store, byte cache, batch door).
 */

jest.mock("@/lib/python-client", () => ({
  resolveBaseUrl: () => "https://server.app.matrxserver.com",
  resolveFilesBaseUrl: () => "https://files.matrxserver.com",
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({}),
    dispatch: jest.fn(),
  }),
}));
jest.mock("@/lib/redux/slices/userSlice", () => ({
  selectAccessToken: () => "jwt-token",
  selectFingerprintId: () => null,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "organization-1",
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: jest.fn() },
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectFileById: () => undefined,
}));
jest.mock("@/features/files/redux/thunks", () => ({
  ensureCloudFileFields: jest.fn(() => async () => undefined),
}));
jest.mock("@/features/files/redux/file-hydration", () => ({
  areCloudFileFieldsLoaded: () => false,
  FILE_RENDER_FIELDS: ["fileName", "mimeType", "fileSize", "visibility"],
}));
jest.mock("@/features/files/hooks/blob-cache", () => ({
  getCached: jest.fn(() => null),
  hydrateFromIdb: jest.fn(async () => null),
  setCached: jest.fn(),
}));
jest.mock("@/features/files/upload/UploadGuardHost", () => ({
  requestUpload: jest.fn(),
}));

import { mediaClient, mediaFilesClient } from "./client";

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

  it("refuses a legacy signed URL (D108) instead of rendering it", () => {
    expect(() =>
      mediaClient.resolve(
        "https://matrx-user-files.s3.amazonaws.com/u/f.png?X-Amz-Signature=abc&X-Amz-Expires=300",
      ),
    ).toThrow(/signed URL is a handoff/i);
  });
});

describe("mediaClient.getBlob — authenticated endpoint URL promotion (F2)", () => {
  it("downloads bytes via the authenticated file_id download, not a bare fetch", async () => {
    // jsdom has no Response constructor — a minimal shape is enough.
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const handle = await mediaClient.getBlob(ENDPOINT_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://files.matrxserver.com/files/${FILE_ID}/download`,
    );
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt-token");
    expect(headers.get("X-Organization-Id")).toBe("organization-1");
    expect(handle.blob.type).toBe("image/png");
    expect(handle.url.startsWith("blob:")).toBe(true);
  });
});

describe("construction", () => {
  it("exposes ONE client instance whose port satisfaction is structural", () => {
    // The MediaClient assignment in client.ts is the compile-time proof;
    // at runtime the two names are the same singleton.
    expect(mediaClient).toBe(mediaFilesClient);
  });

  it("stamps the active organization on every file-session mint", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, expires_in: 7_200 }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await mediaFilesClient.ensureSession({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(url).toMatch(/\/files\/session$/);
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("X-Organization-Id")).toBe("organization-1");
    }
  });
});
