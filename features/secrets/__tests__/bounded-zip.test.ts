/** @jest-environment node */

import { openBoundedZip } from "../bounded-zip";

const limits = { maxFileBytes: 100_000, maxRecords: 10 };

async function archive(name: string, text: string): Promise<Blob> {
  const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add(name, new TextReader(text));
  return writer.close();
}

describe("bounded ZIP entry ownership", () => {
  test("refuses foreign entries for both range and text reads", async () => {
    const first = await openBoundedZip(
      await archive("one.json", "one"),
      limits,
    );
    const second = await openBoundedZip(
      await archive("two.json", "two"),
      limits,
    );
    const foreign = second.entries[0];
    if (!foreign) throw new Error("foreign entry missing");
    try {
      await expect(first.readRange(foreign)).rejects.toThrow("unsafe");
      await expect(first.readText(foreign)).rejects.toThrow("unsafe");
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("validates an owned local range before decoding text", async () => {
    const opened = await openBoundedZip(
      await archive("data.json", "value"),
      limits,
    );
    const entry = opened.entries[0];
    if (!entry) throw new Error("owned entry missing");
    try {
      await expect(opened.readText(entry)).resolves.toBe("value");
    } finally {
      await opened.close();
    }
  });
});
