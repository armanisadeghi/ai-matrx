/** @jest-environment node */

import type { StructuredImportWorkerResponse } from "../structured-import-worker-protocol";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};
const rootId = "AAAAAAAAAAAAAAAAAAAAAA==";
const entryId = "AQAAAAAAAAAAAAAAAAAAAA==";
const xml = `<?xml version="1.0" encoding="UTF-8"?><KeePassFile><Meta></Meta><Root><Group><UUID>${rootId}</UUID><Name>Root</Name><Entry><UUID>${entryId}</UUID><String><Key>Title</Key><Value>Example</Value></String><String><Key>UserName</Key><Value>person</Value></String><String><Key>Password</Key><Value>secret</Value></String><String><Key>URL</Key><Value>https://example.test</Value></String></Entry></Group><DeletedObjects><DeletedObject><UUID>${entryId}</UUID><DeletionTime>2025-01-01T00:00:00Z</DeletionTime></DeletedObject></DeletedObjects></Root></KeePassFile>`;

describe("KeePass XML worker production handler", () => {
  test("reads bounded UTF-8 bytes and returns parser records and fixed notices", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createKeePassXmlWorkerMessageHandler } =
      await import("../keepass-xml.worker");
    await createKeePassXmlWorkerMessageHandler((response) => responses.push(response))({
      type: "parse",
      requestId: "keepass-request",
      file: new Blob([xml]),
      limits,
    });
    expect(responses).toEqual([
      expect.objectContaining({
        ok: true,
        requestId: "keepass-request",
        records: [expect.objectContaining({ title: "Example" })],
        fileNotices: [{ code: "deleted_tombstones", count: 1 }],
      }),
    ]);
  });

  test("rejects oversized files and invalid UTF-8 without reading or exposing source text", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createKeePassXmlWorkerMessageHandler } =
      await import("../keepass-xml.worker");
    const oversized = new Blob(["password=do-not-disclose"]);
    Object.defineProperty(oversized, "size", { value: 100_001 });
    Object.defineProperty(oversized, "arrayBuffer", { value: jest.fn() });
    const handler = createKeePassXmlWorkerMessageHandler((response) =>
      responses.push(response),
    );
    await handler({ type: "parse", requestId: "large", file: oversized, limits });
    await handler({
      type: "parse",
      requestId: "utf8",
      file: new Blob([new Uint8Array([0xff])]),
      limits,
    });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    expect(responses).toEqual([
      { ok: false, requestId: "large", error: "The KeePass XML export could not be read." },
      { ok: false, requestId: "utf8", error: "The KeePass XML export could not be read." },
    ]);
    expect(JSON.stringify(responses)).not.toContain("do-not-disclose");
  });

  test("suppresses a stale result when cancellation arrives before Blob bytes resolve", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    let resolveBytes: ((value: ArrayBuffer) => void) | undefined;
    const file = new Blob([xml]);
    Object.defineProperty(file, "arrayBuffer", {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveBytes = resolve; }),
    });
    const { createKeePassXmlWorkerMessageHandler } =
      await import("../keepass-xml.worker");
    const handler = createKeePassXmlWorkerMessageHandler((response) =>
      responses.push(response),
    );
    const pending = handler({ type: "parse", requestId: "cancelled", file, limits });
    await handler({ type: "cancel", requestId: "cancelled" });
    resolveBytes?.(new TextEncoder().encode(xml).buffer);
    await pending;
    expect(responses).toEqual([]);
  });
});
