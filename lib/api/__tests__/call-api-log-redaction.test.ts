import { buildSafeRequestLog } from "../call-api";

describe("callApi request log redaction", () => {
  it("never returns bearer, cookie, API-key, or body values", () => {
    const sentinel = "SENTINEL_PRIVATE_PROMPT_7f612b";
    const safe = buildSafeRequestLog(
      {
        Authorization: `Bearer ${sentinel}`,
        Cookie: `session=${sentinel}`,
        "X-API-Key": sentinel,
        Accept: "application/json",
      },
      { prompt: sentinel, nested: { secret: sentinel } },
    );

    expect(safe.headers.Authorization).toBe("[REDACTED]");
    expect(safe.headers.Cookie).toBe("[REDACTED]");
    expect(safe.headers["X-API-Key"]).toBe("[REDACTED]");
    expect(safe.headers.Accept).toBe("application/json");
    expect(safe.body).toEqual({ type: "object", keys: ["prompt", "nested"] });
    expect(JSON.stringify(safe)).not.toContain(sentinel);
  });
});
