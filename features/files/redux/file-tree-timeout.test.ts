import { configureStore, createAsyncThunk } from "@reduxjs/toolkit";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { reduxErrorCaptureMiddleware } from "@/lib/diagnostics/reduxErrorCaptureMiddleware";
import {
  createFileTreeLoadTimeout,
  FILE_TREE_LOAD_TIMEOUT_MESSAGE,
  FILE_TREE_LOAD_TIMEOUT_MS,
  fileTreeLoadTimeoutError,
  runWithFileTreeLoadTimeout,
} from "./file-tree-timeout";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** An attempt that stalls until its signal aborts (a frozen background fetch). */
function stallingAttempt() {
  return (signal: AbortSignal) =>
    new Promise<string>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
}

describe("file-tree loading timeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("aborts a stalled tree request at the explicit terminal boundary", () => {
    const { controller, dispose } = createFileTreeLoadTimeout();

    jest.advanceTimersByTime(FILE_TREE_LOAD_TIMEOUT_MS - 1);
    expect(controller.signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  it("clears the boundary after a completed tree request", () => {
    const { controller, dispose } = createFileTreeLoadTimeout();
    dispose();

    jest.advanceTimersByTime(FILE_TREE_LOAD_TIMEOUT_MS);
    expect(controller.signal.aborted).toBe(false);
  });

  it("aborts with a named TimeoutError, never a bare abort", () => {
    const { controller, dispose } = createFileTreeLoadTimeout();
    jest.advanceTimersByTime(FILE_TREE_LOAD_TIMEOUT_MS);
    expect(controller.signal.reason).toMatchObject({
      name: "TimeoutError",
      message: FILE_TREE_LOAD_TIMEOUT_MESSAGE,
    });
    dispose();
  });

  it("a timed-out tree load is still captured as a failure (not a silent cancel)", async () => {
    jest.useRealTimers();
    clearCapturedErrors();
    // Mirrors loadUserFileTree's catch: an aborted signal rejects with the
    // named timeout, never postgrest's stringified "AbortError: …".
    const thunk = createAsyncThunk("cloudFiles/loadUserFileTree", async () => {
      throw fileTreeLoadTimeoutError();
    });
    const store = configureStore({
      reducer: () => ({}),
      middleware: (d) => d().concat(reduxErrorCaptureMiddleware),
    });
    await store.dispatch(thunk());
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "redux-rejected",
      relation: "cloudFiles/loadUserFileTree",
      name: "TimeoutError",
      message: FILE_TREE_LOAD_TIMEOUT_MESSAGE,
    });
  });

  describe("a timeout while the tab is hidden is not a failure", () => {
    afterEach(() => setVisibility("visible"));

    it("waits for the tab to come back, retries once, and captures nothing", async () => {
      clearCapturedErrors();
      setVisibility("hidden");
      const attempt = jest
        .fn<Promise<string>, [AbortSignal]>()
        .mockImplementationOnce(stallingAttempt())
        .mockImplementationOnce(async () => "tree");
      const thunk = createAsyncThunk("cloudFiles/loadUserFileTree", () =>
        runWithFileTreeLoadTimeout(attempt),
      );
      const store = configureStore({
        reducer: () => ({}),
        middleware: (d) => d().concat(reduxErrorCaptureMiddleware),
      });
      const pending = store.dispatch(thunk());

      await jest.advanceTimersByTimeAsync(FILE_TREE_LOAD_TIMEOUT_MS * 3);
      expect(attempt).toHaveBeenCalledTimes(1); // no retry while still hidden
      expect(getSnapshot()).toHaveLength(0);

      setVisibility("visible");
      await jest.advanceTimersByTimeAsync(0);
      const result = await pending;
      expect(attempt).toHaveBeenCalledTimes(2);
      expect(result.payload).toBe("tree");
      expect(getSnapshot()).toHaveLength(0);
    });

    it("a timeout while the tab is visible is still a captured TimeoutError", async () => {
      clearCapturedErrors();
      setVisibility("visible");
      const thunk = createAsyncThunk("cloudFiles/loadUserFileTree", () =>
        runWithFileTreeLoadTimeout(stallingAttempt()),
      );
      const store = configureStore({
        reducer: () => ({}),
        middleware: (d) => d().concat(reduxErrorCaptureMiddleware),
      });
      const pending = store.dispatch(thunk());
      await jest.advanceTimersByTimeAsync(FILE_TREE_LOAD_TIMEOUT_MS);
      await pending;
      expect(getSnapshot()).toHaveLength(1);
      expect(getSnapshot()[0]).toMatchObject({ name: "TimeoutError" });
    });
  });
});
