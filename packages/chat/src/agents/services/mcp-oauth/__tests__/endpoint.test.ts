import {
  buildSupabaseScopedMcpEndpoint,
  validateSupabaseScopedMcpEndpointOverride,
} from "../endpoint";

describe("scoped MCP OAuth endpoints", () => {
  const base = "https://mcp.supabase.com/mcp";

  it("builds a project-scoped read-only Supabase endpoint", () => {
    expect(
      buildSupabaseScopedMcpEndpoint(base, "njrhgywnadxveyvjzjcu"),
    ).toBe(
      "https://mcp.supabase.com/mcp?project_ref=njrhgywnadxveyvjzjcu&read_only=true&features=docs%2Cdatabase%2Cdebugging",
    );
  });

  it("rejects invalid project references", () => {
    expect(() => buildSupabaseScopedMcpEndpoint(base, "production"))
      .toThrow("20-character");
  });

  it.each([
    "http://mcp.supabase.com/mcp?read_only=true",
    "https://attacker.example/mcp?read_only=true",
    "https://mcp.supabase.com/other?read_only=true",
    "https://mcp.supabase.com/mcp#fragment",
  ])("rejects an unsafe override: %s", (candidate) => {
    expect(() =>
      validateSupabaseScopedMcpEndpointOverride(base, candidate),
    ).toThrow();
  });

  it.each([
    "https://mcp.supabase.com/mcp?project_ref=njrhgywnadxveyvjzjcu&read_only=false&features=docs%2Cdatabase%2Cdebugging",
    "https://mcp.supabase.com/mcp?project_ref=njrhgywnadxveyvjzjcu&read_only=true&features=docs%2Cdatabase%2Cdebugging%2Cdevelopment",
    "https://mcp.supabase.com/mcp?project_ref=njrhgywnadxveyvjzjcu&read_only=true&features=docs%2Cdatabase%2Cdebugging&extra=true",
  ])("rejects a widened Supabase scope: %s", (candidate) => {
    expect(() =>
      validateSupabaseScopedMcpEndpointOverride(base, candidate),
    ).toThrow();
  });
});
