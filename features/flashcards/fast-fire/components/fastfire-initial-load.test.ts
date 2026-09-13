import {
  FASTFIRE_INITIAL_LOAD_TIMEOUT_MS,
  FASTFIRE_SETS_LOAD_TIMEOUT_MESSAGE,
  FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE,
  loadFastFireSets,
  loadFastFireSurface,
} from "./fastfire-initial-load";

describe("FastFire initial load boundaries", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("turns a stalled code-split surface into the retryable terminal error", async () => {
    const pendingSurface = new Promise<never>(() => undefined);
    const result = loadFastFireSurface(() => pendingSurface);
    const expectedTerminalError = expect(result).rejects.toThrow(
      FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE,
    );

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);

    await expectedTerminalError;
  });

  it("aborts a stalled set read and returns the retryable terminal error", async () => {
    let rejectRead: (reason: Error) => void = () => undefined;
    const readSets = jest.fn((signal: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        rejectRead = reject;
        signal.addEventListener("abort", () => rejectRead(new Error("aborted")));
      }),
    );
    const result = loadFastFireSets(readSets);

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);

    await expect(result).resolves.toEqual({
      data: null,
      error: FASTFIRE_SETS_LOAD_TIMEOUT_MESSAGE,
    });
  });

  it("clears each boundary when the real loader resolves before its timeout", async () => {
    await expect(loadFastFireSurface(async () => "ready")).resolves.toBe("ready");
    await expect(
      loadFastFireSets(async () => ({ data: [], error: null })),
    ).resolves.toEqual({ data: [], error: null });

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);
  });
});
