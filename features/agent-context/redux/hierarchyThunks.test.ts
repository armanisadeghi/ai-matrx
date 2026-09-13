// A hierarchy request that never settles used to leave every dependent surface
// in its loading skeleton forever. This drives the real thunk boundary: only an
// abortable request plus the thunk's failure dispatch can turn that state into
// the retryable error UI consumes.

const mockRpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: mockRpc },
}));

import { fetchFullContext } from "./hierarchyThunks";

describe("fetchFullContext", () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockRpc.mockReset();
    consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  it("turns an indefinitely pending initial hierarchy read into a retryable error", async () => {
    let rejectRequest: (reason: Error) => void = () => undefined;
    const pendingRequest = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const abortSignal = jest.fn((signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        rejectRequest(new Error("The hierarchy request timed out."));
      });
      return pendingRequest;
    });
    mockRpc.mockReturnValue(Object.assign(pendingRequest, { abortSignal }));

    const actions: Array<{ type: string; payload?: unknown }> = [];
    const dispatch = (action: { type: string; payload?: unknown }) => {
      actions.push(action);
      return action;
    };
    const getState = () => ({ hierarchy: { fullContextStatus: "idle" } });

    void fetchFullContext()(dispatch as never, getState);

    await jest.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "hierarchy/fullContextFetchFailed",
        payload: "Loading your workspace took too long. Please try again.",
      }),
    );
  });

  it("clears the initial-load timeout after the hierarchy returns", async () => {
    const abortSignal = jest.fn(() =>
      Promise.resolve({ data: { organizations: [] }, error: null }),
    );
    mockRpc.mockReturnValue({ abortSignal });

    const actions: Array<{ type: string; payload?: unknown }> = [];
    const dispatch = (action: { type: string; payload?: unknown }) => {
      actions.push(action);
      return action;
    };
    const getState = () => ({ hierarchy: { fullContextStatus: "idle" } });

    await fetchFullContext()(dispatch as never, getState);
    await jest.advanceTimersByTimeAsync(20_000);

    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "hierarchy/fullContextFetchSucceeded",
        payload: { organizations: [] },
      }),
    );
    expect(actions).not.toContainEqual(
      expect.objectContaining({ type: "hierarchy/fullContextFetchFailed" }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});
