import reducer, {
  fetchAvailability,
  selectMcpAvailabilityForOrganization,
  selectMcpAvailabilityStatusForOrganization,
} from "../mcp.slice";
import type { McpAvailability } from "@/features/connectors/connection-state";

const githubAvailability: McpAvailability = {
  slug: "github",
  server_id: "server-github",
  state: "connected",
  reason: null,
  tool_count: 4,
};

describe("MCP availability organization boundary", () => {
  it("clears prior organization truth and ignores its late response", () => {
    const orgA = "organization-a";
    const orgB = "organization-b";
    const stateAfterOrgA = reducer(
      reducer(undefined, fetchAvailability.pending("request-a", { organizationId: orgA })),
      fetchAvailability.fulfilled([githubAvailability], "request-a", { organizationId: orgA }),
    );

    const stateAfterOrgBStarts = reducer(
      stateAfterOrgA,
      fetchAvailability.pending("request-b", { organizationId: orgB }),
    );
    const stateAfterLateOrgA = reducer(
      stateAfterOrgBStarts,
      fetchAvailability.fulfilled([githubAvailability], "request-a", { organizationId: orgA }),
    );

    expect(selectMcpAvailabilityForOrganization({ mcp: stateAfterOrgBStarts }, orgB)).toEqual({});
    expect(selectMcpAvailabilityStatusForOrganization({ mcp: stateAfterOrgBStarts }, orgB)).toBe("loading");
    expect(selectMcpAvailabilityForOrganization({ mcp: stateAfterLateOrgA }, orgB)).toEqual({});
    expect(selectMcpAvailabilityStatusForOrganization({ mcp: stateAfterLateOrgA }, orgB)).toBe("loading");
  });

  it("does not expose another organization's completed truth", () => {
    const orgA = "organization-a";
    const state = reducer(
      reducer(undefined, fetchAvailability.pending("request-a", { organizationId: orgA })),
      fetchAvailability.fulfilled([githubAvailability], "request-a", { organizationId: orgA }),
    );

    expect(selectMcpAvailabilityForOrganization({ mcp: state }, "organization-b")).toEqual({});
    expect(selectMcpAvailabilityStatusForOrganization({ mcp: state }, "organization-b")).toBe("idle");
  });
});
