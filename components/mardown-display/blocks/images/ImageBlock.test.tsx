import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const useMediaResolution = jest.fn();
const useMediaBlob = jest.fn();
const useMediaLoadRecovery = jest.fn();

jest.mock("@ai-matrx/media/core", () => ({
  useMediaResolution,
  useMediaBlob,
  useMediaLoadRecovery,
}));

import ImageBlock from "./ImageBlock";

const FILE_ID = "30b9e3cc-9f1a-4787-bae6-3b47f22d9675";
const ENDPOINT = `https://files.matrxserver.com/files/${FILE_ID}/download`;

describe("ImageBlock authenticated transport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useMediaResolution.mockReset();
    useMediaBlob.mockReset();
    useMediaLoadRecovery.mockReset();
    useMediaResolution.mockReturnValue({
      resolution: {
        src: `${ENDPOINT}?inline=1`,
        kind: "image",
        transport: "blob",
        recoverable: true,
      },
      status: "ready",
      reason: null,
    });
    useMediaBlob.mockReturnValue({
      url: null,
      blob: null,
      loading: true,
      error: null,
      retry: jest.fn(),
    });
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

  it("never binds the private endpoint while authenticated bytes are loading", () => {
    act(() => root.render(<ImageBlock src={ENDPOINT} alt="private image" />));

    expect(useMediaBlob).toHaveBeenCalledWith({ file_id: FILE_ID });
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(null, {
      recoverable: false,
      failureRef: { file_id: FILE_ID },
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBeNull();
  });

  it("renders the authenticated blob and never grants it session recovery", () => {
    useMediaBlob.mockReturnValue({
      url: "blob:https://www.aimatrx.com/authenticated-image",
      blob: new Blob(),
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    act(() => root.render(<ImageBlock src={ENDPOINT} alt="private image" />));

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:https://www.aimatrx.com/authenticated-image",
    );
    expect(useMediaLoadRecovery).toHaveBeenCalledWith(
      "blob:https://www.aimatrx.com/authenticated-image",
      { recoverable: false, failureRef: { file_id: FILE_ID } },
    );
  });
});
