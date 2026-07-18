jest.mock("@/lib/diagnostics/captureStreamError", () => ({
  captureStreamEvent: jest.fn(),
  captureStreamTransportError: jest.fn(),
}));

import { TextDecoder as NodeTextDecoder } from "node:util";
import { parseNdjsonStream } from "../stream-parser";

describe("parseNdjsonStream cancellation", () => {
  beforeAll(() => {
    if (typeof globalThis.TextDecoder === "undefined") {
      Object.defineProperty(globalThis, "TextDecoder", {
        configurable: true,
        value: NodeTextDecoder,
      });
    }
  });

  it("treats Safari's Load failed rejection as cancellation when the signal is aborted", async () => {
    let rejectRead: (reason: unknown) => void = () => undefined;
    const reader = {
      read: jest.fn(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectRead = reject;
          }),
      ),
      releaseLock: jest.fn(),
    };
    const response = {
      body: { getReader: () => reader },
      headers: { get: () => null },
    } as unknown as Response;
    const controller = new AbortController();
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { events } = parseNdjsonStream(response, controller.signal);
    const next = events.next();
    await Promise.resolve();
    controller.abort();
    rejectRead(new TypeError("Load failed"));

    await expect(next).resolves.toEqual({ done: true, value: undefined });
    expect(consoleError).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  it("still reports Load failed when the stream was not cancelled", async () => {
    const reader = {
      read: jest.fn().mockRejectedValue(new TypeError("Load failed")),
      releaseLock: jest.fn(),
    };
    const response = {
      body: { getReader: () => reader },
      headers: { get: () => null },
    } as unknown as Response;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { events } = parseNdjsonStream(response);

    await expect(events.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[stream-parser] readLoop error:",
      expect.objectContaining({ message: "Load failed" }),
    );

    consoleError.mockRestore();
  });
});
