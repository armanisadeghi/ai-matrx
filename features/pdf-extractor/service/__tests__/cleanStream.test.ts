/**
 * @jest-environment node
 *
 * The clean stream's contract with the studio (2026-10-06): heartbeats count
 * as life, a stalled-then-aborted stream is an error (not a quiet finish with
 * no text), and `record_update.status` reaches the caller.
 */
const requestRaw = jest.fn();
jest.mock("@/lib/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

import {
  StreamAbortedError,
  streamPdfClean,
  streamPdfFullPipeline,
} from "../streamPdf";

function ndjson(events: Array<{ event: string; data: unknown }>): Response {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

const DOC = "11111111-1111-1111-1111-111111111111";

beforeEach(() => requestRaw.mockReset());

describe("streamPdfClean", () => {
  it("reports EVERY event as activity, heartbeat included", async () => {
    requestRaw.mockResolvedValue(
      ndjson([
        { event: "heartbeat", data: {} },
        { event: "record_reserved", data: { table: "processed_documents", record_id: DOC } },
        { event: "end", data: {} },
      ]),
    );
    const onActivity = jest.fn();
    await streamPdfClean({ docId: DOC, callbacks: { onActivity } });
    expect(onActivity.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws when the signal aborted the stream instead of ending quietly", async () => {
    requestRaw.mockResolvedValue(ndjson([{ event: "heartbeat", data: {} }]));
    const controller = new AbortController();
    controller.abort();
    await expect(
      streamPdfClean({ docId: DOC, signal: controller.signal }),
    ).rejects.toBeInstanceOf(StreamAbortedError);
  });

  it("hands the record_update status to the caller", async () => {
    requestRaw.mockResolvedValue(
      ndjson([
        {
          event: "record_update",
          data: { db_project: "x", table: "processed_documents", record_id: DOC, status: "awaiting_batch" },
        },
        { event: "end", data: {} },
      ]),
    );
    const seen: Array<string | null> = [];
    const result = await streamPdfClean({
      docId: DOC,
      callbacks: { onRecordUpdate: (_id, status) => seen.push(status) },
    });
    expect(seen).toEqual(["awaiting_batch"]);
    expect(result.recordStatus).toBe("awaiting_batch");
    expect(result.serverConfirmedUpdate).toBe(true);
  });
});

describe("streamPdfFullPipeline", () => {
  it("throws on an aborted stream and reports heartbeat activity", async () => {
    requestRaw.mockResolvedValue(ndjson([{ event: "heartbeat", data: {} }]));
    const onActivity = jest.fn();
    await streamPdfFullPipeline({
      body: { url: "https://example.com/a.pdf" },
      callbacks: { onActivity },
    });
    expect(onActivity).toHaveBeenCalled();

    requestRaw.mockResolvedValue(ndjson([{ event: "heartbeat", data: {} }]));
    const controller = new AbortController();
    controller.abort();
    await expect(
      streamPdfFullPipeline({
        body: { url: "https://example.com/a.pdf" },
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(StreamAbortedError);
  });
});
