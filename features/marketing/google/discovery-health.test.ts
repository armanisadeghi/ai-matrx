import { googleDiscoveryHealth } from "./discovery-health";

describe("googleDiscoveryHealth", () => {
  it("keeps Search Console connected when optional Analytics is unavailable", () => {
    expect(googleDiscoveryHealth(true, false)).toEqual({
      status: "connected",
      lastError: null,
      metadata: {
        discovery: {
          search_console: "ready",
          analytics: "unavailable",
        },
        discovery_warning_count: 1,
      },
    });
  });

  it("requires attention only when no provider can be discovered", () => {
    expect(googleDiscoveryHealth(false, false).status).toBe("needs_attention");
  });
});
