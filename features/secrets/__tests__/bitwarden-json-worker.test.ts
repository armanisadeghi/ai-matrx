/** @jest-environment node */

import type { StructuredImportWorkerResponse } from "../structured-import-worker-protocol";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};

const exportJson = JSON.stringify({
  encrypted: false,
  folders: [],
  items: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Example",
      type: 1,
      login: {
        username: "person",
        password: "secret",
        uris: [{ uri: "https://example.test", match: 0 }],
      },
    },
  ],
});

describe("Bitwarden worker production handler", () => {
  test("reads its real Blob boundary and returns the required request ID", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createBitwardenJsonWorkerMessageHandler } =
      await import("../bitwarden-json.worker");

    await createBitwardenJsonWorkerMessageHandler((response) =>
      responses.push(response),
    )({
      type: "parse",
      requestId: "bitwarden-request",
      file: new Blob([exportJson]),
      limits,
    });

    expect(responses).toEqual([
      expect.objectContaining({
        ok: true,
        requestId: "bitwarden-request",
        fileNotices: [],
        records: [
          expect.objectContaining({ title: "Example", username: "person" }),
        ],
      }),
    ]);
  });

  test("does not post after the matching cancellation", async () => {
    const responses: StructuredImportWorkerResponse[] = [];
    const { createBitwardenJsonWorkerMessageHandler } =
      await import("../bitwarden-json.worker");
    const handle = createBitwardenJsonWorkerMessageHandler((response) =>
      responses.push(response),
    );
    const pending = handle({
      type: "parse",
      requestId: "bitwarden-request",
      file: new Blob([exportJson]),
      limits,
    });
    await handle({ type: "cancel", requestId: "bitwarden-request" });
    await pending;
    expect(responses).toEqual([]);
  });
});

test("returns a fixed source-free error for Blob, JSON, and UTF-8 failures", async () => {
  const responses: StructuredImportWorkerResponse[] = [];
  const { createBitwardenJsonWorkerMessageHandler } =
    await import("../bitwarden-json.worker");
  const handle = createBitwardenJsonWorkerMessageHandler((response) =>
    responses.push(response),
  );
  const sentinel = "password=do-not-disclose";
  const rejectedBlob = new Blob(["ignored"]);
  Object.defineProperty(rejectedBlob, "arrayBuffer", {
    value: async () => {
      throw new Error(sentinel);
    },
  });
  const malformedJson = new Blob(["{"]);
  const invalidUtf8 = new Blob([new Uint8Array([0xff])]);

  for (const [index, file] of [
    rejectedBlob,
    malformedJson,
    invalidUtf8,
  ].entries()) {
    await handle({
      type: "parse",
      requestId: `failure-${index}`,
      file,
      limits,
    });
  }

  expect(responses).toEqual([
    {
      ok: false,
      requestId: "failure-0",
      error: "The JSON export could not be read.",
    },
    {
      ok: false,
      requestId: "failure-1",
      error: "The JSON export could not be read.",
    },
    {
      ok: false,
      requestId: "failure-2",
      error: "The JSON export could not be read.",
    },
  ]);
  expect(JSON.stringify(responses)).not.toContain(sentinel);
});
