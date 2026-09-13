/**
 * Regression: browsers that reject a freshly-created blob: SVG in Image still
 * accept the same bytes as a data URL, so PNG Export must use that portable
 * image source at the public download seam.
 */

import { downloadMermaidPng } from "./export";

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8">',
  '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">one<br>two ✓</div></foreignObject>',
  "</svg>",
].join("");

describe("downloadMermaidPng", () => {
  const originalImage = global.Image;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalClick = HTMLAnchorElement.prototype.click;

  afterEach(() => {
    global.Image = originalImage;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: originalGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: originalToBlob,
    });
    HTMLAnchorElement.prototype.click = originalClick;
  });

  it("downloads a PNG when blob decoding rejects Mermaid XHTML labels", async () => {
    const png = new Blob(["png-bytes"], { type: "image/png" });
    const createObjectURL = jest.fn(() => "blob:export-result");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const drawImage = jest.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: jest.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: jest.fn((callback: BlobCallback) => {
        callback(png);
      }),
    });
    HTMLAnchorElement.prototype.click = jest.fn();

    class BrowserImage {
      naturalWidth = 12;
      naturalHeight = 8;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        queueMicrotask(() => {
          if (value.startsWith("blob:")) this.onerror?.();
          else if (value.startsWith("data:image/svg+xml;base64,")) {
            const svg = atob(value.slice("data:image/svg+xml;base64,".length));
            if (svg.includes("<br>")) this.onerror?.();
            else this.onload?.();
          }
          else throw new Error(`Unexpected image source: ${value}`);
        });
      }
    }
    global.Image = BrowserImage as unknown as typeof Image;

    await downloadMermaidPng(SVG, "Browser-safe diagram");

    // A canned PNG return cannot satisfy this: the image must decode and be
    // rasterized at the SVG's real viewBox dimensions before download.
    expect(drawImage).toHaveBeenCalledWith(expect.any(BrowserImage), 0, 0, 24, 16);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(png);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-result");
  });
});
