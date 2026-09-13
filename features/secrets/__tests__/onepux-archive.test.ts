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
  test("rejects a byte-corrupted selected JSON member", async () => {
    const file = await archive([["export.attributes", "attrs"], ["export.data", "data"]]);
    const bytes = new Uint8Array(await file.arrayBuffer()); bytes[40] = bytes[40]! ^ 1;
    await expect(read(new Blob([bytes], { type: "application/zip" }))).rejects.toThrow();
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
    const disks: BlobWriter[] = [];
    async function* writers() { while (true) { const writer = new BlobWriter("application/zip"); disks.push(writer); yield writer; } }
    const writer = new ZipWriter(new SplitDataWriter(writers(), 40));
    await writer.add("export.attributes", new TextReader("attributes")); await writer.add("export.data", new TextReader("data")); await writer.close();
    await expect(read(await disks[0]!.getData())).rejects.toThrow();
  });
  test("refuses declared expansion above the budget even when compressed", async () => {
    const file = await archive([["export.attributes", "a".repeat(500)], ["export.data", "d".repeat(500)]]);
    expect(file.size).toBeLessThan(1_000);
    await expect((await import("../onepux-archive")).readOnePuxArchive(file, { maxFileBytes: 900, maxRecords: 10 })).rejects.toThrow();
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
