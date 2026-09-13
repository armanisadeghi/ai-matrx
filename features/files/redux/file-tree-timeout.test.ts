import {
  createFileTreeLoadTimeout,
  FILE_TREE_LOAD_TIMEOUT_MS,
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
});
