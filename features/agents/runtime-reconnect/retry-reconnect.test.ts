import {
  registerAbortController,
  unregisterAbortController,
  ownsAbortController,
  abortConversation,
} from "../redux/execution-system/thunks/abort-registry";
import { fetchRejoin, retryReconnect } from "./retry-reconnect";

describe("read-only reconnect retries", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  test("survives two offline attempts and returns the same recovered value", async () => {
    const value = { stream: "retained" };
    const attempt = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(value);
    const result = retryReconnect(attempt, new AbortController().signal);
    await jest.runAllTimersAsync();
    expect(await result).toBe(value);
    expect(attempt).toHaveBeenCalledTimes(3);
  });
  test("does not retry authorization failures", async () => {
    const error = Object.assign(new Error("forbidden"), { status: 403 });
    const attempt = jest.fn().mockRejectedValue(error);
    await expect(
      retryReconnect(attempt, new AbortController().signal),
    ).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  test("a new stream owner prevents a stale retry", async () => {
    let owner = true;
    const attempt = jest.fn().mockRejectedValue(new TypeError("offline"));
    const result = retryReconnect(
      attempt,
      new AbortController().signal,
      () => owner,
    );
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    owner = false;
    await jest.runAllTimersAsync();
    await rejected;
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  test("a newer registered stream survives stale rejoin cleanup without another fetch", async () => {
    const old = new AbortController();
    const current = new AbortController();
    registerAbortController("test", old);
    global.fetch = jest.fn().mockRejectedValue(new TypeError("offline"));
    const result = fetchRejoin(
      "/runtime/operations/test/rejoin",
      { signal: old.signal },
      old.signal,
      () => ownsAbortController("test", old),
    );
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    registerAbortController("test", current);
    await jest.runAllTimersAsync();
    await rejected;
    unregisterAbortController("test", old);
    expect(ownsAbortController("test", current)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    abortConversation("test");
    expect(current.signal.aborted).toBe(true);
  });
  test("cancel stops retries immediately", async () => {
    const ctrl = new AbortController();
    const attempt = jest.fn().mockRejectedValue(new TypeError("offline"));
    const result = retryReconnect(attempt, ctrl.signal);
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    ctrl.abort();
    await rejected;
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  test("rejoin releases transient HTTP bodies before replaying the same endpoint", async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const success = { status: 200 } as Response;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ status: 503, body: { cancel } })
      .mockResolvedValue(success);
    const signal = new AbortController().signal;
    const init = { method: "POST", signal };
    const result = fetchRejoin("/runtime/operations/test/rejoin", init, signal);
    await jest.runAllTimersAsync();
    expect(await result).toBe(success);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/runtime/operations/test/rejoin",
      init,
    );
  });
});
