import {
  isSchemaCacheUnavailableResult,
  postgrestResultErrorMessage,
  wrapClientForCapture,
} from "@/lib/diagnostics/supabaseErrorCapture";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

describe("postgrestResultErrorMessage", () => {
  it("preserves the upstream sentence when PostgREST provides one", () => {
    expect(
      postgrestResultErrorMessage({
        error: { message: "canceling statement due to statement timeout" },
        status: 500,
      }),
    ).toBe("canceling statement due to statement timeout");
  });

  it("names the HTTP failure when PostgREST returns an empty message", () => {
    expect(
      postgrestResultErrorMessage({
        error: { message: "" },
        status: 500,
        statusText: "Internal Server Error",
      }),
    ).toBe(
      "Supabase request failed with HTTP 500 (Internal Server Error); PostgREST returned no error message",
    );
  });
});

describe("schema-cache recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCapturedErrors();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("recognizes only PostgREST's not-executed schema-cache response", () => {
    expect(
      isSchemaCacheUnavailableResult({
        error: { code: "PGRST002", message: "schema cache unavailable" },
        status: 503,
      }),
    ).toBe(true);
    expect(
      isSchemaCacheUnavailableResult({
        error: { code: "57014", message: "statement timed out" },
        status: 500,
      }),
    ).toBe(false);
  });

  it("retries PGRST002 before capture and returns the recovered result", async () => {
    const unavailable = {
      data: null,
      error: { code: "PGRST002", message: "schema cache unavailable" },
      status: 503,
    };
    const recovered = { data: [{ id: "membership-1" }], error: null, status: 200 };
    const results = [unavailable, recovered];
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(results.shift()));
      },
    };
    const client = wrapClientForCapture({ rpc: () => builder });

    const request = client.rpc();
    const pending = Promise.resolve(request);
    await jest.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toEqual(recovered);
    expect(results).toHaveLength(0);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("captures one canonical error after schema-cache retries are exhausted", async () => {
    const unavailable = {
      data: null,
      error: { code: "PGRST002", message: "schema cache unavailable" },
      status: 503,
    };
    let executions = 0;
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        executions += 1;
        return Promise.resolve(onFulfilled(unavailable));
      },
    };
    const client = wrapClientForCapture({ rpc: () => builder });

    const pending = Promise.resolve(client.rpc());
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual(unavailable);

    expect(executions).toBe(3);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "supabase-postgrest",
      code: "PGRST002",
    });
  });

  it("keeps a browser transport loss local instead of filing a repair error", async () => {
    const transportLoss = {
      data: null,
      error: {
        code: "",
        message: "TypeError: Failed to fetch",
        details: "TypeError: Failed to fetch",
        hint: "",
      },
      status: 0,
    };
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(transportLoss));
      },
    };
    const client = wrapClientForCapture({ rpc: () => builder });

    await expect(Promise.resolve(client.rpc())).resolves.toEqual(transportLoss);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "supabase-postgrest",
      name: "TypeError",
      status: 0,
      tier: "yellow",
      tierRuleId: "supabase-browser-transport-loss",
    });
  });
});
