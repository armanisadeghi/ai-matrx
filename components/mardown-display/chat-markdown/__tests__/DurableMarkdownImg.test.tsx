import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const useMediaBlob = jest.fn();
const useMediaLoadRecovery = jest.fn();

jest.mock("@ai-matrx/media/core", () => ({
  useMediaBlob,
  useMediaLoadRecovery,
}));

jest.mock("@/components/markdown-core/MarkdownCore", () => ({
  default: () => null,
}));

import { DurableMarkdownImg } from "../ConfigurableMarkdownContent";

const FILE_ID = "30b9e3cc-9f1a-4787-bae6-3b47f22d9675";
const ENDPOINT = `https://files.matrxserver.com/files/${FILE_ID}/download`;
const AUTHENTICATED_BLOB = "blob:https://www.aimatrx.com/authenticated-file";

describe("DurableMarkdownImg", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useMediaBlob.mockReset();
    useMediaBlob.mockReturnValue({
      url: null,
      blob: null,
      loading: false,
      error: null,
      retry: jest.fn(),
    });
    useMediaLoadRecovery.mockReset();
    useMediaLoadRecovery.mockReturnValue({
      retryKey: 0,
      onLoadError: jest.fn(),
      failed: false,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("promotes an owned byte endpoint to file identity before binding the image", () => {
    useMediaBlob.mockReturnValue({
      url: AUTHENTICATED_BLOB,
      blob: new Blob(),
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    act(() => {
      root.render(<DurableMarkdownImg src={ENDPOINT} alt="generated chart" />);
    });

    expect(useMediaBlob).toHaveBeenCalledWith({ file_id: FILE_ID });
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(AUTHENTICATED_BLOB, {
      recoverable: false,
      failureRef: { file_id: FILE_ID },
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      AUTHENTICATED_BLOB,
    );
  });

  it("keeps a foreign image URL external and does not grant session recovery", () => {
    const external = "https://example.com/chart.png";

    act(() => {
      root.render(<DurableMarkdownImg src={external} alt="external chart" />);
    });

    expect(useMediaBlob).toHaveBeenCalledWith(null);
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(external, {
      recoverable: false,
      failureRef: null,
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(external);
  });

  it("never falls back to the unauthenticated byte endpoint while the blob loads", () => {
    act(() => {
      root.render(<DurableMarkdownImg src={ENDPOINT} alt="generated chart" />);
    });

    expect(useMediaBlob).toHaveBeenCalledWith({ file_id: FILE_ID });
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(null, {
      recoverable: false,
      failureRef: { file_id: FILE_ID },
    });
    expect(container.querySelector("img")).toBeNull();
  });
});
