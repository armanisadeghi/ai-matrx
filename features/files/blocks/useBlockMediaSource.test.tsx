import { renderHook } from "@/test-utils/renderHook";

const useMediaResolution = jest.fn();
const useMediaBlob = jest.fn();
const useMediaLoadRecovery = jest.fn();

jest.mock("@ai-matrx/media/core", () => ({
  useMediaResolution: (...args: unknown[]) => useMediaResolution(...args),
  useMediaBlob: (...args: unknown[]) => useMediaBlob(...args),
  useMediaLoadRecovery: (...args: unknown[]) =>
    useMediaLoadRecovery(...args),
}));

import { useBlockMediaSource } from "./useBlockMediaSource";
import type { ImageBlock } from "./types";

const FILE_ID = "a2458139-793b-4c55-b067-a488a5ca11ea";
const ENDPOINT = `https://files.matrxserver.com/files/${FILE_ID}/download`;

const block: ImageBlock = {
  kind: "image",
  origin: "external",
  externalUrl: ENDPOINT,
  sourceLabel: null,
  status: "complete",
  progress: null,
  errorMessage: null,
  mimeType: null,
  fileName: null,
  sizeBytes: null,
  base64: null,
  metadata: null,
  width: null,
  height: null,
  visionClass: null,
};

describe("useBlockMediaSource private image transport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMediaResolution.mockReturnValue({
      resolution: {
        src: ENDPOINT,
        kind: "image",
        transport: "blob",
        recoverable: true,
      },
      status: "ready",
    });
    useMediaBlob.mockReturnValue({ url: "blob:private-image", error: null });
    useMediaLoadRecovery.mockReturnValue({
      retryKey: 0,
      onLoadError: jest.fn(),
      failed: false,
    });
  });

  it("uses authenticated blob bytes for an owned endpoint disguised as a URL", async () => {
    const hook = await renderHook(() => useBlockMediaSource(block));

    expect(useMediaBlob).toHaveBeenCalledWith({
      url: ENDPOINT,
      mime_type: undefined,
    });
    expect(hook.current).toMatchObject({
      src: "blob:private-image",
      status: "ready",
      isPlaceholder: false,
    });
    // Session refresh belongs to direct element transport. A blob-backed
    // image must never bind the durable endpoint directly and recreate this
    // failure class.
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(null, {
      recoverable: true,
    });
    await hook.unmount();
  });
});

describe("useBlockMediaSource never binds our authenticated endpoint as a CDN URL", () => {
  // A matrx block whose adapter filed the durable `?inline=1` endpoint into
  // the `cdnUrl` slot and labelled the row `public` — exactly what the chat
  // produced for a `personal` gpt-image-2 result on 2026-09-16 (the block
  // carried no visibility, the adapter guessed). Taking the "public + CDN →
  // element" shortcut here binds the third-party-cookie lane to an <img>:
  // "Image unavailable" forever in any browser that blocks those cookies.
  const INLINE = `https://server.app.matrxserver.com/files/${FILE_ID}/download?inline=1`;
  const mislabelled: ImageBlock = {
    kind: "image",
    origin: "matrx",
    fileId: FILE_ID,
    visibility: "public",
    cdnUrl: INLINE,
    downloadUrl: null,
    parentFileId: null,
    derivationKind: null,
    status: "complete",
    progress: null,
    errorMessage: null,
    mimeType: "image/png",
    fileName: null,
    sizeBytes: null,
    base64: null,
    metadata: null,
    width: null,
    height: null,
    visionClass: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useMediaResolution.mockReturnValue({
      resolution: { src: INLINE, kind: "image", transport: "blob", recoverable: true },
      status: "ready",
    });
    useMediaBlob.mockReturnValue({ url: "blob:private-image", error: null });
    useMediaLoadRecovery.mockReturnValue({ retryKey: 0, onLoadError: jest.fn(), failed: false });
  });

  it("hands the client the file_id so it owns the private/public decision", async () => {
    const hook = await renderHook(() => useBlockMediaSource(mislabelled));
    expect(useMediaResolution).toHaveBeenCalledWith({
      file_id: FILE_ID,
      mime_type: "image/png",
    });
    expect(hook.current.src).toBe("blob:private-image");
    await hook.unmount();
  });
});
