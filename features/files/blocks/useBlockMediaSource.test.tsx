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
