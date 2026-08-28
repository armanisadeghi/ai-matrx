import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInlineMediaRef = jest.fn();

jest.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

jest.mock("./InlineMediaRef", () => ({
  InlineMediaRef: (props: Record<string, unknown>) => {
    mockInlineMediaRef(props);
    return <div data-testid="inline-media" />;
  },
}));

import { MediaAttachmentThumbnail } from "./MediaAttachmentThumbnail";

const FILE_ID = "118b67d2-2f79-48a3-9216-f57b8e611bd8";

describe("MediaAttachmentThumbnail transport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses authenticated blob bytes after an upload becomes a file id", () => {
    act(() => {
      root.render(
        <MediaAttachmentThumbnail
          mediaRef={FILE_ID}
          status="ready"
          title="Product image"
          onOpen={jest.fn()}
          onRemove={jest.fn()}
        />,
      );
    });

    expect(mockInlineMediaRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: FILE_ID,
        crossOrigin: "anonymous",
      }),
    );
  });

  it("does not force blob transport for an external image URL", () => {
    act(() => {
      root.render(
        <MediaAttachmentThumbnail
          mediaRef="https://example.com/product.jpeg"
          status="ready"
          title="External image"
          onOpen={jest.fn()}
          onRemove={jest.fn()}
        />,
      );
    });

    expect(mockInlineMediaRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: "https://example.com/product.jpeg",
        crossOrigin: undefined,
      }),
    );
  });
});
