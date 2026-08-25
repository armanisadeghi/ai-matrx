import {
  MCP_FULL_ACCESS_PERMISSION,
  hasMcpFullAccessPermission,
  withMcpFullAccessPermission,
} from "./mcp-access";

describe("MCP full-access app metadata", () => {
  it("adds and removes only the MCP permission", () => {
    const existing = {
      provider: "email",
      permissions: ["reports.view"],
    };

    const granted = withMcpFullAccessPermission(existing, true);
    expect(granted).toEqual({
      provider: "email",
      permissions: [MCP_FULL_ACCESS_PERMISSION, "reports.view"],
    });
    expect(hasMcpFullAccessPermission(granted)).toBe(true);

    const revoked = withMcpFullAccessPermission(granted, false);
    expect(revoked).toEqual({
      provider: "email",
      permissions: ["reports.view"],
    });
    expect(hasMcpFullAccessPermission(revoked)).toBe(false);
    expect(existing).toEqual({
      provider: "email",
      permissions: ["reports.view"],
    });
  });

  it("does not accept malformed permissions metadata", () => {
    expect(hasMcpFullAccessPermission({ permissions: "mcp.full_access" })).toBe(
      false,
    );
  });
});
