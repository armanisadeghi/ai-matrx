jest.mock("@/lib/diagnostics/captureStreamError", () => ({
  captureStreamEvent: jest.fn(),
  captureStreamTransportError: jest.fn(),
}));

import { TextDecoder as NodeTextDecoder } from "node:util";
import { captureStreamTransportError } from "@/lib/diagnostics/captureStreamError";
import { BackendApiError } from "../errors";
import { parseNdjsonStream } from "../stream-parser";

describe("parseNdjsonStream cancellation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  // A transport failure on a LIVE stream is never swallowed. Before the wire
  // kernel extraction it was only `console.error`-logged and the generator then
  // ended as if the response had completed — a dropped socket looked identical
  // to a finished answer. It now becomes a typed BackendApiError that is
  // recorded once (Error Inspector) and re-thrown; `callApi` relies on that
  // same object reaching its catch so one dropped socket is one red row.
  it("surfaces Load failed as a typed transport error when the stream was not cancelled", async () => {
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

    await expect(events.next()).rejects.toMatchObject({
      name: "BackendApiError",
      code: "internal_error",
      detail: "Load failed",
      userMessage: "The connection to the AI response was lost.",
    });

    expect(captureStreamTransportError).toHaveBeenCalledTimes(1);
    expect(
      jest.mocked(captureStreamTransportError).mock.calls[0]?.[0],
    ).toBeInstanceOf(BackendApiError);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    // The failure travels as a structured error, not as console noise.
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
