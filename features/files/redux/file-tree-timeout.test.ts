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
} from "./file-tree-timeout";

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
});
