/** @jest-environment node */

const limits = { maxFileBytes: 100_000, maxRecords: 10 };
async function read(file: Blob, signal?: AbortSignal) {
  return (await import("../onepux-archive")).readOnePuxArchive(file, limits, signal);
}
async function archive(entries: Array<[string, string]>) {
  const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, value] of entries) await writer.add(name, new TextReader(value));
  return writer.close();
}
describe("1PUX archive reader", () => {
  test("reads maintained-writer JSON and counts binary members without inflating them", async () => {
    const file = await archive([["export.attributes", "attrs"], ["export.data", "data"], ["files/icon", "binary"]]);
    await expect(read(file)).resolves.toEqual({ attributesText: "attrs", dataText: "data", binaryMemberCount: 1 });
  });
  test("rejects missing required members, traversal, and entry budget", async () => {
    await expect(read(await archive([["export.data", "data"]]))).rejects.toThrow();
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"], ["files/a/b", "x"]]))).rejects.toThrow();
  });
  test("honors cancellation before opening", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"]]), controller.signal)).rejects.toThrow("cancelled");
  });
  test("classifies cancellation after archive reading begins", async () => {
    const controller = new AbortController();
    const file = await archive([["export.attributes", "a".repeat(500_000)], ["export.data", "d".repeat(500_000)]]);
    const pending = (await import("../onepux-archive")).readOnePuxArchive(file, { maxFileBytes: 2_000_000, maxRecords: 10 }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });
  test("classifies cancellation after an actual decoded stream chunk", async () => {
    const controller = new AbortController(); const NativeWritableStream = globalThis.WritableStream;
    let writes = 0;
    class AbortAfterChunk extends NativeWritableStream<Uint8Array> {
      constructor(sink?: UnderlyingSink<Uint8Array>) { super({ ...sink, async write(chunk, writer) { await sink?.write?.call(sink, chunk, writer); if (sink?.write && chunk.byteLength > 0) { writes += 1; controller.abort(); } } }); }
    }
    Object.defineProperty(globalThis, "WritableStream", { configurable: true, value: AbortAfterChunk });
    try {
      const file = await archive([["export.attributes", "a".repeat(200_000)], ["export.data", "d".repeat(200_000)]]);
      await expect((await import("../onepux-archive")).readOnePuxArchive(file, { maxFileBytes: 1_000_000, maxRecords: 10 }, controller.signal)).rejects.toThrow("cancelled");
      expect(writes).toBeGreaterThan(0);
    } finally { Object.defineProperty(globalThis, "WritableStream", { configurable: true, value: NativeWritableStream }); }
  });
  test("rejects a byte-corrupted selected JSON member", async () => {
    const file = await archive([["export.attributes", "attrs"], ["export.data", "data"]]);
    const bytes = new Uint8Array(await file.arrayBuffer()); bytes[40] = bytes[40]! ^ 1;
    await expect(read(new Blob([bytes], { type: "application/zip" }))).rejects.toThrow();
  });
  test("rejects a real local-extra warning that appears only after reading", async () => {
    const { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } = await import("@zip.js/zip.js");
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    await writer.add("export.attributes", new TextReader("attrs"), { extraField: new Map([[0xcafe, new Uint8Array([1, 2])]]) });
    await writer.add("export.data", new TextReader("data"));
    const bytes = new Uint8Array(await (await writer.close()).arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const extraOffset = 30 + view.getUint16(26, true); view.setUint16(extraOffset + 2, 0xffff, true);
    const malformed = new Blob([bytes], { type: "application/zip" });
    const raw = new ZipReader(new BlobReader(malformed), { strictness: "strict", filenameValidation: "strict", checkAmbiguity: true });
    const [entry] = await raw.getEntries(); if (!entry || !("getData" in entry)) throw new Error("entry missing");
    await entry.getData(new WritableStream<Uint8Array>(), { checkOverlappingEntryOnly: true });
    expect(entry.warnings?.some((warning) => warning.reason === "malformed extra field")).toBe(true);
    await raw.close();
    await expect(read(malformed)).rejects.toThrow();
  });
  test("refuses entries outside the exact member grammar", async () => {
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"], ["../escape", "x"]]))).rejects.toThrow();
  });
  test("refuses a real writer Unix symlink entry", async () => {
    const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    await writer.add("export.attributes", new TextReader("a"));
    await writer.add("export.data", new TextReader("d"));
    await writer.add("files/link", new TextReader("target"), { externalFileAttributes: 0o120777 << 16, versionMadeBy: 3 << 8 });
    await expect(read(await writer.close())).rejects.toThrow();
  });
  test("refuses a real split-disk fragment", async () => {
    const { BlobWriter, SplitDataWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
    const disks: Array<InstanceType<typeof BlobWriter>> = [];
    async function* writers(): AsyncGenerator<never, boolean, unknown> { while (true) { const writer = new BlobWriter("application/zip"); disks.push(writer); yield writer as never; } }
    const writer = new ZipWriter(new SplitDataWriter(writers(), 40));
    await writer.add("export.attributes", new TextReader("attributes")); await writer.add("export.data", new TextReader("data")); await writer.close();
    await expect(read(await disks[0]!.getData())).rejects.toThrow();
  });
  test("refuses declared expansion above the budget even when compressed", async () => {
    const file = await archive([["export.attributes", "a".repeat(500)], ["export.data", "d".repeat(500)]]);
    expect(file.size).toBeLessThan(1_000);
    await expect((await import("../onepux-archive")).readOnePuxArchive(file, { maxFileBytes: 900, maxRecords: 10 })).rejects.toThrow();
  });
  test("combines declared archive bytes with streamed decoded JSON bytes", async () => {
    const file = await archive([["export.attributes", "a".repeat(300)], ["export.data", "d".repeat(300)]]);
    await expect((await import("../onepux-archive")).readOnePuxArchive(file, { maxFileBytes: 900, maxRecords: 10 })).rejects.toThrow("size limit");
  });
  test.each(["files/\u0001name", "files/name\u007f"])("refuses a control-character member name from the maintained writer: %s", async (name) => {
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"], [name, "x"]]))).rejects.toThrow();
  });
  test("refuses a mutated binary local-header name", async () => {
    const file = await archive([["export.attributes", "a"], ["export.data", "d"], ["files/icon", "x"]]);
    const bytes = new Uint8Array(await file.arrayBuffer()); const name = new TextEncoder().encode("files/icon");
    const offset = bytes.findIndex((_, index) => name.every((value, inner) => bytes[index + inner] === value));
    if (offset < 0) throw new Error("binary local header name missing");
    bytes[offset] = 120;
    await expect(read(new Blob([bytes], { type: "application/zip" }))).rejects.toThrow();
  });
});
