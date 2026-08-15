import {
  classifyUnprocessableError,
  fetchThroughDeploymentDrain,
} from "../run-ai-stream";

describe("classifyUnprocessableError", () => {
  test("only invalid_uuid is labeled as a conversation ID error", () => {
    expect(classifyUnprocessableError("invalid_uuid", "bad id").prefix).toBe(
      "Invalid conversation ID",
    );
    expect(
      classifyUnprocessableError("agent_model_missing", "agent has no model")
        .prefix,
    ).toBe("Agent execution failed");
    expect(
      classifyUnprocessableError(null, "schema validation failed").prefix,
    ).toBe("Request rejected");
  });

  test("preserves the tool-injection classification", () => {
    expect(
      classifyUnprocessableError("tool_not_found", "missing local tool"),
    ).toEqual({ prefix: "Tool injection failed", isToolError: true });
  });
});

describe("fetchThroughDeploymentDrain", () => {
  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, "fetch");
  });

  test("retries a POST only after an explicit pre-execution drain response", async () => {
    jest.useFakeTimers();
    const drainResponse = {
      status: 503,
      headers: {
        get: (name: string) =>
          name === "X-Matrx-Drain"
            ? "deployment"
            : name === "Retry-After"
              ? "1"
              : null,
      },
      body: { cancel: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Response;
    const okResponse = { status: 200 } as Response;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(drainResponse)
      .mockResolvedValueOnce(okResponse);
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
    });
    const controller = new AbortController();

    const pending = fetchThroughDeploymentDrain(
      "/api/v2/ai/agents/example",
      { method: "POST", body: "{}" },
      controller.signal,
    );
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_000);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not replay an ambiguous first-attempt transport failure", async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new TypeError("network lost"));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
    });
    const controller = new AbortController();

    await expect(
      fetchThroughDeploymentDrain(
        "/api/v2/ai/agents/example",
        { method: "POST", body: "{}" },
        controller.signal,
      ),
    ).rejects.toThrow("network lost");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
