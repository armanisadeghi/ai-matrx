const requestRaw = jest.fn();
jest.mock("@/lib/python-client", () => ({ requestRaw: (...a: unknown[]) => requestRaw(...a) }));
jest.mock("@ai-matrx/agents/stream/sse", () => ({ readMatrxSseStream: async function* () {} }));

import { streamSse } from "./sse";

describe("streamSse target", () => {
  beforeEach(() => requestRaw.mockReset());

  it("refuses an absolute URL (it was joined onto the base twice)", async () => {
    await expect(
      streamSse("https://server.example.com/runs/stream", () => {}, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/server-relative path/);
    expect(requestRaw).not.toHaveBeenCalled();
  });

  it("sends the relative path with the origin as the base override", async () => {
    requestRaw.mockResolvedValue({ ok: true, body: {} });
    await streamSse("/runs/stream", () => {}, {
      signal: new AbortController().signal,
      baseUrl: "https://server.example.com",
    });
    expect(requestRaw).toHaveBeenCalledWith(
      "/runs/stream",
      expect.anything(),
      expect.objectContaining({ baseUrlOverride: "https://server.example.com" }),
    );
  });
});
