/** @jest-environment node */

import { readDashlaneCsvArchive } from "../dashlane-csv-archive";

const limits = { maxFileBytes: 100_000, maxRecords: 10 };

async function archive(entries: Array<[string, string]>): Promise<Blob> {
  const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, value] of entries)
    await writer.add(name, new TextReader(value));
  return writer.close();
}

describe("Dashlane CSV archive reader", () => {
  test("returns credentials CSV and counts validated omitted top-level CSVs", async () => {
    await expect(
      readDashlaneCsvArchive(
        await archive([
          ["Credentials.CSV", "title,username,password\nExample,person,secret"],
          ["ids.csv", "type,number\nid,123"],
          ["payments.csv", "type,number\ncard,456"],
        ]),
        limits,
      ),
    ).resolves.toEqual({
      credentialsText: "title,username,password\nExample,person,secret",
      omittedCsvCount: 2,
    });
  });

  test("rejects missing or case-insensitively duplicate credentials members", async () => {
    await expect(
      readDashlaneCsvArchive(await archive([["ids.csv", "id"]]), limits),
    ).rejects.toThrow("invalid");
    await expect(
      readDashlaneCsvArchive(
        await archive([
          ["credentials.csv", "one"],
          ["CREDENTIALS.CSV", "two"],
        ]),
        limits,
      ),
    ).rejects.toThrow("invalid");
  });

  test("rejects directories, nested members, and non-CSV members", async () => {
    await expect(
      readDashlaneCsvArchive(
        await archive([["folder/credentials.csv", "value"]]),
        limits,
      ),
    ).rejects.toThrow("invalid");
    await expect(
      readDashlaneCsvArchive(
        await archive([
          ["credentials.csv", "value"],
          ["notes.txt", "secret note"],
        ]),
        limits,
      ),
    ).rejects.toThrow("invalid");
    const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    await writer.add("folder/", undefined, { directory: true });
    await writer.add("credentials.csv", new TextReader("value"));
    await expect(readDashlaneCsvArchive(await writer.close(), limits)).rejects.toThrow(
      "invalid",
    );
  });

  test("enforces archive entry and expansion limits", async () => {
    await expect(
      readDashlaneCsvArchive(
        await archive([
          ["credentials.csv", "value"],
          ["ids.csv", "id"],
          ["payments.csv", "payment"],
        ]),
        { maxFileBytes: 100_000, maxRecords: 2 },
      ),
    ).rejects.toThrow("unsafe");
    await expect(
      readDashlaneCsvArchive(
        await archive([
          ["credentials.csv", "a".repeat(500)],
          ["ids.csv", "b".repeat(500)],
        ]),
        { maxFileBytes: 900, maxRecords: 10 },
      ),
    ).rejects.toThrow("unsafe");
  });

  test("rejects CRC corruption and unsafe Unix symlink members", async () => {
    const file = await archive([["credentials.csv", "title\nvalue"]]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const byte = bytes[40];
    if (byte === undefined) throw new Error("archive fixture is unexpectedly short");
    bytes[40] = byte ^ 1;
    await expect(
      readDashlaneCsvArchive(new Blob([bytes], { type: "application/zip" }), limits),
    ).rejects.toThrow();

    const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    await writer.add("credentials.csv", new TextReader("value"));
    await writer.add("ids.csv", new TextReader("target"), {
      externalFileAttributes: 0o120777 << 16,
      versionMadeBy: 3 << 8,
    });
    await expect(readDashlaneCsvArchive(await writer.close(), limits)).rejects.toThrow(
      "unsafe",
    );
  });

  test("cancels during omitted-member validation without returning credentials text", async () => {
    const controller = new AbortController();
    const NativeWritableStream = globalThis.WritableStream;
    class AbortAfterChunk extends NativeWritableStream<Uint8Array> {
      constructor(sink?: UnderlyingSink<Uint8Array>) {
        super({
          ...sink,
          async write(chunk, writer) {
            await sink?.write?.call(sink, chunk, writer);
            if (chunk.byteLength > 0) controller.abort();
          },
        });
      }
    }
    Object.defineProperty(globalThis, "WritableStream", {
      configurable: true,
      value: AbortAfterChunk,
    });
    try {
      await expect(
        readDashlaneCsvArchive(
          await archive([
            ["credentials.csv", "title,username,password\nExample,person,secret"],
            ["ids.csv", "x".repeat(200_000)],
          ]),
          { maxFileBytes: 1_000_000, maxRecords: 10 },
          controller.signal,
        ),
      ).rejects.toThrow("cancelled");
    } finally {
      Object.defineProperty(globalThis, "WritableStream", {
        configurable: true,
        value: NativeWritableStream,
      });
    }
  });
});
