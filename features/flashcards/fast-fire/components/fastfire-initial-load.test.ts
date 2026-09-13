import {
  FASTFIRE_INITIAL_LOAD_TIMEOUT_MS,
  loadFastFireSets,
  loadFastFireSurface,
} from "./fastfire-initial-load";

const SURFACE_TIMEOUT_COPY = "FastFire took too long to load. Try again.";
const SETS_TIMEOUT_COPY = "Your flashcard sets took too long to load. Try again.";

describe("FastFire initial load boundaries", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("turns a stalled code-split surface into the retryable terminal error", async () => {
    const pendingSurface = new Promise<never>(() => undefined);
    const result = loadFastFireSurface(() => pendingSurface);
    const expectedTerminalError = expect(result).rejects.toThrow(
      SURFACE_TIMEOUT_COPY,
    );

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);

    await expectedTerminalError;
  });

  it("aborts a stalled set read and returns the retryable terminal error", async () => {
    let rejectRead: (reason: Error) => void = () => undefined;
    const readSets = jest.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          rejectRead = reject;
          signal.addEventListener("abort", () =>
            rejectRead(new Error("aborted")),
          );
        }),
    );
    const result = loadFastFireSets(readSets);

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);

    await expect(result).resolves.toEqual({
      data: null,
      error: SETS_TIMEOUT_COPY,
    });
  });

  it("clears each boundary when the real loader resolves before its timeout", async () => {
    await expect(loadFastFireSurface(async () => "ready")).resolves.toBe(
      "ready",
    );
    await expect(
      loadFastFireSets(async () => ({ data: [], error: null })),
    ).resolves.toEqual({ data: [], error: null });

    await jest.advanceTimersByTimeAsync(FASTFIRE_INITIAL_LOAD_TIMEOUT_MS);
  });
});
