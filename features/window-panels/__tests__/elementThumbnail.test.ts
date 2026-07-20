import { captureElementThumbnail } from "@/hooks/useScreenCapture";
import * as htmlToImage from "html-to-image";

jest.mock("html-to-image", () => ({
  toCanvas: jest.fn(),
}));

const mockedToCanvas = jest.mocked(htmlToImage.toCanvas);

describe("captureElementThumbnail", () => {
  it("caps the longest edge, uses one-pixel density, and encodes WebP", async () => {
    const element = document.createElement("div");
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 800 },
      offsetHeight: { configurable: true, value: 600 },
    });
    const resultBlob = new Blob(["thumbnail"], { type: "image/webp" });
    const toBlob = jest.fn(
      (callback: BlobCallback, type?: string, quality?: number) => {
        expect(type).toBe("image/webp");
        expect(quality).toBe(0.62);
        callback(resultBlob);
      },
    );
    mockedToCanvas.mockResolvedValue({ toBlob } as unknown as HTMLCanvasElement);

    const result = await captureElementThumbnail(element);

    expect(mockedToCanvas).toHaveBeenCalledWith(element, {
      pixelRatio: 1,
      canvasWidth: 320,
      canvasHeight: 240,
      skipFonts: true,
    });
    expect(result).toBe(resultBlob);
  });

  it("never enlarges a source that is already below the output cap", async () => {
    const element = document.createElement("div");
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 240 },
      offsetHeight: { configurable: true, value: 128 },
    });
    const toBlob = jest.fn((callback: BlobCallback) => callback(null));
    mockedToCanvas.mockResolvedValue({ toBlob } as unknown as HTMLCanvasElement);

    await expect(captureElementThumbnail(element)).resolves.toBeNull();
    expect(mockedToCanvas).toHaveBeenLastCalledWith(element, {
      pixelRatio: 1,
      canvasWidth: 240,
      canvasHeight: 128,
      skipFonts: true,
    });
  });
});
