import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseFileAsset = jest.fn();
const mockUseFileBlob = jest.fn();
const mockGetCached = jest.fn();
const mockUseFileSrc = jest.fn();

jest.mock("@/features/files/hooks/useFileAsset", () => ({
  useFileAsset: (...args: unknown[]) => mockUseFileAsset(...args),
}));

jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: (...args: unknown[]) => mockUseFileBlob(...args),
}));

jest.mock("@/features/files/hooks/blob-cache", () => ({
  getCached: (...args: unknown[]) => mockGetCached(...args),
}));

jest.mock("@/features/files/handler/hooks/useFileSrc", () => ({
  useFileSrc: (...args: unknown[]) => mockUseFileSrc(...args),
}));

jest.mock("@/features/files/handler/hooks/useDurableSrc", () => ({
  useDurableSrc: (url: string | null) => ({
    src: url ?? "",
    retryKey: 0,
    onError: jest.fn(),
    failed: false,
  }),
}));

jest.mock("@/features/files/components/core/FileIcon/FileIcon", () => ({
  FileIcon: () => <div data-testid="file-icon" />,
}));

import { MediaThumbnail } from "./MediaThumbnail";

const FILE_ID = "118b67d2-2f79-48a3-9216-f57b8e611bd8";
const THUMB_ID = "57cdb1d7-5dd1-4614-8b06-6412f472c1ed";

const privateImage = {
  id: FILE_ID,
  fileName: "Product 15A.jpeg",
  mimeType: "image/jpeg",
  fileSize: 120,
  metadata: {},
  publicUrl: null,
  thumbnailUrl: null,
  visibility: "personal" as const,
};

describe("MediaThumbnail durable pixels", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCached.mockReturnValue(null);
    mockUseFileSrc.mockReturnValue(null);
    mockUseFileAsset.mockReturnValue({
      asset: null,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
    mockUseFileBlob.mockImplementation((fileId: string | null) => ({
      url: fileId ? `blob:${fileId}` : null,
      blob: null,
      loading: false,
      bytesLoaded: 0,
      bytesTotal: null,
      error: null,
      retry: jest.fn(),
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a private thumbnail variant through its authenticated file id", () => {
    mockUseFileAsset.mockReturnValue({
      asset: {
        variants: {
          thumbnail_url: {
            file_id: THUMB_ID,
            url: "https://server/thumbnail",
            cdn_url: null,
          },
        },
      },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    act(() => {
      root.render(<MediaThumbnail file={privateImage} />);
    });

    expect(mockUseFileBlob).toHaveBeenCalledWith(THUMB_ID);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `blob:${THUMB_ID}`,
    );
  });

  it("keeps freshly uploaded pixels visible while the asset variant resolves", () => {
    mockGetCached.mockReturnValue({
      url: `blob:${FILE_ID}`,
      blob: new Blob(["image"]),
    });

    act(() => {
      root.render(<MediaThumbnail file={privateImage} />);
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `blob:${FILE_ID}`,
    );
    expect(container.querySelector('[data-testid="file-icon"]')).toBeNull();
  });

  it("uses the permanent URL directly for public media", () => {
    const publicImage = {
      ...privateImage,
      visibility: "public" as const,
      publicUrl: "https://cdn/public-image.jpeg",
      thumbnailUrl: "https://cdn/public-thumb.jpeg",
    };

    act(() => {
      root.render(<MediaThumbnail file={publicImage} />);
    });

    expect(mockUseFileBlob).toHaveBeenCalledWith(null);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      publicImage.thumbnailUrl,
    );
  });
});
