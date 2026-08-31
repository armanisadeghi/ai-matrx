import QRCode from "qrcode";

import { decodeQrFromImageData } from "@ai-matrx/kit/qr";

function qrFrame(text: string): ImageData {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const scale = 8;
  const margin = 4 * scale;
  const edge = qr.modules.size * scale + margin * 2;
  const data = new Uint8ClampedArray(edge * edge * 4).fill(255);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixelX = margin + column * scale + x;
          const pixelY = margin + row * scale + y;
          const offset = (pixelY * edge + pixelX) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  const ImageDataCtor = globalThis.ImageData;
  return ImageDataCtor
    ? new ImageDataCtor(data, edge, edge)
    : ({ data, width: edge, height: edge, colorSpace: "srgb" } as ImageData);
}

describe("product capture deterministic QR camera", () => {
  it("decodes sequential fixture payloads through the production decoder", async () => {
    expect(await decodeQrFromImageData(qrFrame("QR-Q28-003"))).toBe(
      "QR-Q28-003",
    );
    expect(await decodeQrFromImageData(qrFrame("QR-Q28-004"))).toBe(
      "QR-Q28-004",
    );
  });
});
