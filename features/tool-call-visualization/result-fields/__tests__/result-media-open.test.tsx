import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: () => <div data-testid="inline-media" />,
}));

import { ResultMedia } from "../ResultMedia";

const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";

describe("ResultMedia open action", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("owned tool-result media opens the canonical in-app file viewer", () => {
    act(() => {
      root.render(
        <ResultMedia
          refValue={{ file_id: FILE_ID, mime_type: "image/png" }}
          alt="Captured page"
        />,
      );
    });

    const open = container.querySelector<HTMLAnchorElement>('a[aria-label="View in Files"]');
    expect(open?.getAttribute("href")).toBe(`/files/f/${FILE_ID}`);
    expect(open?.getAttribute("target")).toBe("_blank");
  });

  test("external media does not pretend it has an in-app file identity", () => {
    act(() => {
      root.render(
        <ResultMedia
          refValue={{ url: "https://example.com/capture.png", mime_type: "image/png" }}
        />,
      );
    });

    expect(container.querySelector('a[aria-label="View in Files"]')).toBeNull();
  });
});
