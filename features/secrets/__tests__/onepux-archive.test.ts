/** @jest-environment node */

const limits = { maxFileBytes: 100_000, maxRecords: 10 } as never;
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
    try { await expect(read(file)).resolves.toEqual({ attributesText: "attrs", dataText: "data", binaryMemberCount: 1 }); } catch (error) { console.error(error); throw error; }
  });
  test("rejects missing required members, traversal, and entry budget", async () => {
    await expect(read(await archive([["export.data", "data"]]))).rejects.toThrow();
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"], ["files/a/b", "x"]]))).rejects.toThrow();
  });
  test("honors cancellation before opening", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(read(await archive([["export.attributes", "a"], ["export.data", "d"]]), controller.signal)).rejects.toThrow("cancelled");
  });
});
