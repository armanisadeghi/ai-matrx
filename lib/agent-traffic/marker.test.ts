/**
 * The agent-traffic marker and its browser forwarder.
 *
 * Breaks it catches: the cookie is set but never read; the forwarder marks a
 * VISITOR's request (no cookie) or a signed-in one; a server that refuses the
 * header in CORS turns every guest request into a failure instead of an
 * unmarked request.
 */
import {
  MATRX_AGENT_TRAFFIC,
  agentTrafficFromCookieHeader,
  agentTrafficHeaders,
  agentTrafficOf,
  agentTrafficSetCookie,
} from "./marker";

describe("marker", () => {
  it("reads the header first, then the cookie", () => {
    const h = new Headers({ "x-matrx-agent-traffic": "walk", cookie: "matrx_agent_traffic=other" });
    expect(agentTrafficOf(h)).toBe("walk");
    expect(agentTrafficOf(new Headers({ cookie: "a=1; matrx_agent_traffic=local-preview" }))).toBe(
      "local-preview",
    );
    expect(agentTrafficOf(new Headers({ cookie: "a=1" }))).toBeNull();
  });

  it("round-trips its own Set-Cookie value", () => {
    const pair = agentTrafficSetCookie("dev login!", false).split(";")[0];
    expect(agentTrafficFromCookieHeader(pair)).toBe("dev-login-");
  });

  it("names the tool in the header value", () => {
    expect(agentTrafficHeaders("pw:walk")).toEqual({ [MATRX_AGENT_TRAFFIC.header]: "pw:walk" });
  });
});

describe("browser forwarder", () => {
  const calls: { url: string; headers: Headers }[] = [];
  let corsRefuses = false;

  beforeAll(async () => {
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      if (corsRefuses && url.endsWith("/health") && headers.has(MATRX_AGENT_TRAFFIC.header))
        throw new TypeError("Failed to fetch");
      calls.push({ url, headers });
      return new Response("{}");
    }) as typeof fetch;
    await import("./AgentTrafficForwarder");
  });

  beforeEach(() => {
    calls.length = 0;
    document.cookie = `${MATRX_AGENT_TRAFFIC.cookie}=; max-age=0`;
  });

  const guest = { "X-Fingerprint-ID": "fp-1" };

  it("never touches a visitor's request (no cookie)", async () => {
    await fetch("https://server.example/ai/run", { headers: guest });
    expect(calls.at(-1)!.headers.has(MATRX_AGENT_TRAFFIC.header)).toBe(false);
  });

  it("forwards the cookie as the header on a guest request", async () => {
    document.cookie = `${MATRX_AGENT_TRAFFIC.cookie}=local-preview`;
    await fetch("https://server.example/ai/run", { headers: guest });
    expect(calls.at(-1)!.headers.get(MATRX_AGENT_TRAFFIC.header)).toBe("local-preview");
  });

  it("leaves a signed-in request alone (only guests mint)", async () => {
    document.cookie = `${MATRX_AGENT_TRAFFIC.cookie}=local-preview`;
    await fetch("https://server.example/ai/run", { headers: { Authorization: "Bearer x" } });
    expect(calls.at(-1)!.headers.has(MATRX_AGENT_TRAFFIC.header)).toBe(false);
  });

  it("sends unmarked, never fails, when an origin's CORS refuses the header", async () => {
    corsRefuses = true;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    document.cookie = `${MATRX_AGENT_TRAFFIC.cookie}=local-preview`;
    const response = await fetch("https://old-server.example/ai/run", { headers: guest });
    expect(response.ok).toBe(true);
    expect(calls.at(-1)!.headers.has(MATRX_AGENT_TRAFFIC.header)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    corsRefuses = false;
  });
});
