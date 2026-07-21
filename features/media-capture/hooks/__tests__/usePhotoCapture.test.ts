/**
 * Geometry-integration tests for capturePhotoFromVideo: the canvas is sized
 * to the SOURCE crop from sourceRect(...) (never element offsets) and
 * drawImage receives exactly that region. Canvas/toBlob are injected mocks.
 */

import {
  capturePhotoFromVideo,
  captureFileName,
  type CaptureVideoSource,
} from "../usePhotoCapture";
import { sourceRect } from "../../core/geometry";

interface MockCanvas {
  canvas: HTMLCanvasElement;
  drawImage: jest.Mock;
}

function makeMockCanvas(): MockCanvas {
  const drawImage = jest.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({ drawImage })),
    toBlob: (cb: (b: Blob | null) => void, type?: string) => {
      cb(new Blob(["jpeg-bytes"], { type: type ?? "image/jpeg" }));
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, drawImage };
}

function makeVideo(w: number, h: number): CaptureVideoSource {
  return { videoWidth: w, videoHeight: h } as CaptureVideoSource;
}

describe("capturePhotoFromVideo — canvas geometry", () => {
  it("full-frame captures the entire stream frame (WYSIWYG dims)", async () => {
    const { canvas, drawImage } = makeMockCanvas();
    const video = makeVideo(1920, 1080);

    const result = await capturePhotoFromVideo(
      { video, framing: "full-frame" },
      { createCanvas: () => canvas },
    );

    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(
      video,
      0,
      0,
      1920,
      1080,
      0,
      0,
      1920,
      1080,
    );
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toMatch(/^capture-\d{4}-\d{2}-\d{2}T[\d-]+Z\.jpg$/);
  });

  it("viewport-crop draws exactly the sourceRect region (portrait container, landscape stream)", async () => {
    const { canvas, drawImage } = makeMockCanvas();
    const video = makeVideo(1920, 1080);
    const container = { width: 390, height: 844 };

    await capturePhotoFromVideo(
      { video, framing: "viewport-crop", container },
      { createCanvas: () => canvas },
    );

    const rect = sourceRect(390, 844, 1920, 1080, "viewport-crop");
    expect(canvas.width).toBe(Math.round(rect.sWidth));
    expect(canvas.height).toBe(Math.round(rect.sHeight));
    expect(drawImage).toHaveBeenCalledWith(
      video,
      rect.sx,
      rect.sy,
      rect.sWidth,
      rect.sHeight,
      0,
      0,
      Math.round(rect.sWidth),
      Math.round(rect.sHeight),
    );
    // The crop is a SOURCE-pixel region, never container/layout pixels.
    expect(rect.sHeight).toBe(1080);
    expect(rect.sWidth).toBeLessThan(1920);
  });

  it("viewport-crop is DPR-independent (scaled container → identical rect)", async () => {
    const a = sourceRect(390, 844, 1920, 1080, "viewport-crop");
    const b = sourceRect(780, 1688, 1920, 1080, "viewport-crop");
    expect(b).toEqual(a);
  });

  it("viewport-crop without a container size throws (caller bug, never silent)", async () => {
    const { canvas } = makeMockCanvas();
    await expect(
      capturePhotoFromVideo(
        { video: makeVideo(1280, 720), framing: "viewport-crop" },
        { createCanvas: () => canvas },
      ),
    ).rejects.toThrow(/container/);
  });

  it("zero intrinsic dims throw loudly (no capture before loadedmetadata)", async () => {
    const { canvas } = makeMockCanvas();
    await expect(
      capturePhotoFromVideo(
        { video: makeVideo(0, 0), framing: "full-frame" },
        { createCanvas: () => canvas },
      ),
    ).rejects.toThrow(/positive finite/);
  });

  it("source settings fall back to intrinsic video dims without a lease", async () => {
    const { canvas } = makeMockCanvas();
    const result = await capturePhotoFromVideo(
      { video: makeVideo(1280, 720), framing: "full-frame" },
      { createCanvas: () => canvas },
    );
    expect(result.sourceSettings).toEqual({
      width: 1280,
      height: 720,
      frame_rate: null,
      facing_mode: null,
    });
  });
});

describe("captureFileName", () => {
  it("flattens filesystem-hostile ISO characters", () => {
    const name = captureFileName(
      "capture",
      new Date("2026-07-21T18:30:05.123Z"),
      "jpg",
    );
    expect(name).toBe("capture-2026-07-21T18-30-05-123Z.jpg");
  });
});
