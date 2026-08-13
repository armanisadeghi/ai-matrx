import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseFileAs = jest.fn();
const mockUseFileBlob = jest.fn();

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    unoptimized: _unoptimized,
    alt = "",
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img alt={alt} {...props} />
  ),
}));

jest.mock("@/features/files/handler/hooks/useFileAs", () => ({
  useFileAs: (...args: unknown[]) => mockUseFileAs(...args),
}));

jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: (...args: unknown[]) => mockUseFileBlob(...args),
}));

jest.mock("@/features/audio/useOutputSinkRef", () => ({
  useOutputSinkRef: () => jest.fn(),
}));

jest.mock("@/features/audio/session/useMediaElementPlaybackSession", () => ({
  useMediaElementPlaybackSession: jest.fn(),
}));

jest.mock("@/features/files/handler/intelligence/signed-url-cache", () => ({
  getOrMintSignedUrl: jest.fn(),
  invalidateSignedUrl: jest.fn(),
}));

import { InlineMediaRef } from "./InlineMediaRef";

const FILE_ID = "118b67d2-2f79-48a3-9216-f57b8e611bd8";

describe("InlineMediaRef canvas transport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFileAs.mockReturnValue({
      result: "https://cdn.matrxserver.com/user/file",
      status: "ready",
      error: null,
    });
    mockUseFileBlob.mockImplementation((fileId: string | null) => ({
      url: fileId ? "blob:https://manage.aimatrx.com/canvas-safe" : null,
      blob: fileId ? new Blob(["image"]) : null,
      loading: false,
      bytesLoaded: fileId ? 5 : 0,
      bytesTotal: fileId ? 5 : null,
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

  it("loads ID-backed canvas media through the authenticated blob cache", () => {
    act(() => {
      root.render(
        <InlineMediaRef
          ref={FILE_ID}
          crossOrigin="anonymous"
          alt="Screenshot"
        />,
      );
    });

    expect(mockUseFileBlob).toHaveBeenCalledWith(FILE_ID);
    expect(mockUseFileAs).toHaveBeenCalledWith(null, {
      kind: "fetchable_url",
    });
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "blob:https://manage.aimatrx.com/canvas-safe",
    );
  });

  it("keeps ordinary previews on the universal display URL path", () => {
    act(() => {
      root.render(<InlineMediaRef ref={FILE_ID} alt="Screenshot" />);
    });

    expect(mockUseFileBlob).toHaveBeenCalledWith(null);
    expect(mockUseFileAs).toHaveBeenCalledWith(
      { kind: "file_id", fileId: FILE_ID },
      { kind: "html_src" },
    );
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "https://cdn.matrxserver.com/user/file",
    );
  });
});
