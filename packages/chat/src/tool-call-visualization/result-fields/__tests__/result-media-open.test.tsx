import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: ({ as }: { as?: "img" | "video" | "audio" }) => (
    <div data-testid="inline-media" data-as={as ?? "inferred"} />
  ),
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
          mediaRef={{ file_id: FILE_ID, mime_type: "image/png" }}
          alt="Captured page"
        />,
      );
    });

    const open = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="View in Files"]',
    );
    expect(open?.getAttribute("href")).toBe(`/files/f/${FILE_ID}`);
    expect(open?.getAttribute("target")).toBe("_blank");
  });

  test("external media does not pretend it has an in-app file identity", () => {
    act(() => {
      root.render(
        <ResultMedia
          mediaRef={{
            url: "https://example.com/capture.png",
            mime_type: "image/png",
          }}
        />,
      );
    });

    expect(container.querySelector('a[aria-label="View in Files"]')).toBeNull();
  });

  test("file-id-only media delegates element selection to hydrated file metadata", () => {
    act(() => {
      root.render(
        <ResultMedia
          mediaRef={{ file_id: "74e43cbd-db1a-4aea-ad67-cee6fdb946ac" }}
          alt="Generated podcast"
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="inline-media"]')?.getAttribute("data-as"),
    ).toBe("inferred");
  });

  test.each([
    ["audio/mpeg", "audio"],
    ["video/mp4", "video"],
    ["image/png", "img"],
  ] as const)("a known %s hint selects the %s element immediately", (mimeType, element) => {
    act(() => {
      root.render(
        <ResultMedia
          mediaRef={{ file_id: FILE_ID, mime_type: mimeType }}
          alt="Generated media"
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="inline-media"]')?.getAttribute("data-as"),
    ).toBe(element);
  });

  test("canonical MIME wins when a field-name hint disagrees", () => {
    act(() => {
      root.render(
        <ResultMedia
          mediaRef={{ file_id: FILE_ID, mime_type: "video/mp4" }}
          elementTypeHint="audio"
          alt="Generated media"
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="inline-media"]')?.getAttribute("data-as"),
    ).toBe("video");
  });
});
