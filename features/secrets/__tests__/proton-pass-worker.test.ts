/** @jest-environment node */
import type { StructuredImportWorkerResponse } from "../structured-import-worker-protocol";
const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};
const json = JSON.stringify({
  version: "1",
  vaults: {
    share: {
      description: "",
      display: {},
      name: "V",
      items: [
        {
          itemId: "i",
          shareId: "share",
          data: {
            type: "note",
            content: {},
            extraFields: [],
            metadata: { name: "N", note: "", itemUuid: "u" },
          },
          state: 1,
          aliasEmail: null,
          contentFormatVersion: 8,
          createTime: 1,
          modifyTime: 1,
          pinned: false,
          files: ["x"],
        },
      ],
    },
  },
});
async function zip() {
  const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add("Proton Pass/data.json", new TextReader(json));
  await writer.add("Proton Pass/files/x", new TextReader("bytes"));
  return writer.close();
}
describe("Proton Pass worker", () => {
  test("reads a real plain ZIP without exposing binary contents", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createProtonPassWorkerMessageHandler } =
      await import("../proton-pass.worker");
    await createProtonPassWorkerMessageHandler((response) =>
      responses.push(response),
    )({ type: "parse", requestId: "p", file: await zip(), limits });
    expect(responses).toEqual([
      expect.objectContaining({
        ok: true,
        requestId: "p",
        binaryMemberCount: 1,
        records: [expect.objectContaining({ status: "unsupported" })],
      }),
    ]);
  });
  test("projects malformed exports to one source-free error", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createProtonPassWorkerMessageHandler } =
      await import("../proton-pass.worker");
    await createProtonPassWorkerMessageHandler((response) =>
      responses.push(response),
    )({
      type: "parse",
      requestId: "p",
      file: new Blob(["password=secret"]),
      limits,
    });
    expect(responses).toEqual([
      {
        ok: false,
        requestId: "p",
        error: "The Proton Pass export could not be read.",
      },
    ]);
  });
  test("enforces the file-size limit before reading a plain JSON Blob", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const file = new Blob(["{}"]);
    Object.defineProperty(file, "size", { value: 100_001 });
    Object.defineProperty(file, "arrayBuffer", { value: jest.fn() });
    const { createProtonPassWorkerMessageHandler } =
      await import("../proton-pass.worker");
    await createProtonPassWorkerMessageHandler((response) =>
      responses.push(response),
    )({
      type: "parse",
      requestId: "oversized",
      file,
      limits,
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(responses[0]).toMatchObject({ ok: false, requestId: "oversized" });
  });
});
