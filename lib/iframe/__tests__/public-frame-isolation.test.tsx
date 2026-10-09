import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server.node";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// Other rendering branches are external to the URL fallback under test.
jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  KindValueFrontDoor: () => null,
}));
jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  ArtifactRender: () => null,
  hasArtifactRenderer: () => false,
}));
jest.mock("@ai-matrx/rich-content/display/blocks/common/SandboxedHtml", () => ({
  __esModule: true,
  default: () => null,
}));
import { PublicCanvasRenderer } from "@/features/canvas/shared/PublicCanvasRenderer";
it.each(["/p/agenda", "https://www.youtube.com/embed/M7lc1UVf-VE"])(
  "public URL fallback hydrates safely and reloads when restoring player origin: %s",
  async (data) => {
    const element = (
      <PublicCanvasRenderer content={{ type: "unsupported_embed", data }} />
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    const original = host.querySelector("iframe");
    expect(original?.getAttribute("sandbox")).not.toContain(
      "allow-same-origin",
    );
    document.body.appendChild(host);
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, element);
      });
      const frame = host.querySelector("iframe");
      if (data.startsWith("https:")) {
        expect(frame?.getAttribute("sandbox")).toContain("allow-same-origin");
        expect(frame).not.toBe(original);
      } else {
        expect(frame?.getAttribute("sandbox")).not.toContain(
          "allow-same-origin",
        );
        expect(frame).toBe(original);
      }
    } finally {
      if (root) act(() => root!.unmount());
      host.remove();
    }
  },
);
