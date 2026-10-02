import {
  isSchemaCacheUnavailableResult,
  postgrestResultErrorMessage,
  suppressSupabaseErrorCapture,
  allowAbsentDoor,
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

  it("classifies the current browser abort wording as expected control flow", async () => {
    const aborted = {
      data: null,
      error: {
        code: "",
        message: "AbortError: signal is aborted without reason",
        details: "",
        hint: "",
      },
      status: 0,
    };
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(aborted));
      },
    };
    const client = wrapClientForCapture({
      schema: (_schema: string) => ({ from: (_relation: string) => builder }),
    });

    await expect(
      Promise.resolve(client.schema("users").from("integration_connections")),
    ).resolves.toEqual(aborted);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({
      source: "supabase-postgrest",
      name: "AbortError",
      relation: "integration_connections",
      tier: "yellow",
      tierRuleId: "request-aborted",
    });
  });

  it("lets a retry owner suppress premature capture for one builder", async () => {
    const transportLoss = {
      data: null,
      error: { code: "", message: "TypeError: Load failed" },
      status: 0,
    };
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(transportLoss));
      },
    };
    const client = wrapClientForCapture({ rpc: () => builder });

    const request = suppressSupabaseErrorCapture(client.rpc());
    await expect(Promise.resolve(request)).resolves.toEqual(transportLoss);
    expect(getSnapshot()).toHaveLength(0);
  });

  /** A builder whose `.abortSignal(s)` chains like postgrest-js and answers `result`. */
  function abortableBuilder(result: unknown) {
    const builder = {
      abortSignal(_signal: AbortSignal) {
        return builder;
      },
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(result));
      },
    };
    return builder;
  }
  const abortedAnswer = {
    data: null,
    error: {
      code: "",
      message: "AbortError: signal is aborted without reason",
      hint: "Request was aborted (timeout or manual cancellation)",
    },
    status: 0,
  };

  it("files nothing when the CALLER aborted its own request (a superseded save)", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = wrapClientForCapture({
      schema: (_s: string) => ({ from: (_r: string) => abortableBuilder(abortedAnswer) }),
    });
    const answer = await client.schema("users").from("user_preferences").abortSignal(controller.signal);
    expect(answer).toEqual(abortedAnswer);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("still files an abort the caller did NOT ask for (a timeout signal)", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("timed out", "TimeoutError"));
    const client = wrapClientForCapture({
      schema: (_s: string) => ({ from: (_r: string) => abortableBuilder(abortedAnswer) }),
    });
    await client.schema("users").from("user_preferences").abortSignal(controller.signal);
    expect(getSnapshot()).toHaveLength(1);
  });

  it("still files a real error on a chain whose signal was aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const denied = { data: null, error: { code: "42501", message: "permission denied" }, status: 403 };
    const client = wrapClientForCapture({
      schema: (_s: string) => ({ from: (_r: string) => abortableBuilder(denied) }),
    });
    await client.schema("users").from("user_preferences").abortSignal(controller.signal);
    expect(getSnapshot()).toHaveLength(1);
  });

  it("allowAbsentDoor: an absent door owned by a fallback is not filed; any other failure is", async () => {
    const absent = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function communication.my_inbox_summary" },
      status: 404,
    };
    const denied = { data: null, error: { code: "42501", message: "permission denied" }, status: 403 };
    let answer: unknown = absent;
    const client = wrapClientForCapture({
      schema: (_s: string) => ({
        rpc: (_fn: string) => ({
          then(onFulfilled: (value: unknown) => unknown) {
            return Promise.resolve(onFulfilled(answer));
          },
        }),
      }),
    });
    await allowAbsentDoor(client.schema("communication").rpc("my_inbox_summary"));
    expect(getSnapshot()).toHaveLength(0);
    answer = denied;
    await allowAbsentDoor(client.schema("communication").rpc("my_inbox_summary"));
    expect(getSnapshot()).toHaveLength(1);
  });

  it("without allowAbsentDoor an absent door is still filed", async () => {
    const absent = { data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 };
    const client = wrapClientForCapture({
      rpc: (_fn: string) => ({
        then(onFulfilled: (value: unknown) => unknown) {
          return Promise.resolve(onFulfilled(absent));
        },
      }),
    });
    await client.rpc("anything");
    expect(getSnapshot()).toHaveLength(1);
  });
});

describe("a re-scoped client is still captured (RC-B12 round 4)", () => {
  beforeEach(() => clearCapturedErrors());

  it("captures a failure read through .schema(a).schema(b).from(x)", async () => {
    const failed = { data: null, error: { code: "XX500", message: "forced failure" }, status: 500 };
    const builder = {
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(onFulfilled(failed));
      },
    };
    const scope = (): Record<string, unknown> => ({ from: () => builder, schema: () => scope() });
    const client = wrapClientForCapture({ schema: () => scope() }) as unknown as {
      schema: (n: string) => { schema: (n: string) => { from: (r: string) => PromiseLike<unknown> } };
    };

    await Promise.resolve(client.schema("scheduler").schema("scheduler").from("sch_task"));
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ relation: "sch_task" });
  });
});
