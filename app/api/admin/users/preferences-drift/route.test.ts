/** @jest-environment node */

const mockRequireSuperAdmin = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock("@/utils/auth/adminUtils", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { GET } from "./route";

const driftRows = Array.from({ length: 1001 }, (_, index) => ({
  user_id: `user-${String(index).padStart(4, "0")}`,
  organization_id: "organization-1",
  drifted_fields: "theme",
  updated_at: "2026-09-22T00:00:00Z",
}));

describe("GET preferences drift report", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSuperAdmin.mockResolvedValue(undefined);
  });

  it("returns all drift rows beyond the PostgREST response cap", async () => {
    const ranges: Array<[number, number]> = [];
    const rpc = jest.fn(() => {
      const range = jest.fn(async (from: number, to: number) => {
        ranges.push([from, to]);
        return { data: driftRows.slice(from, to + 1), count: driftRows.length, error: null };
      });
      const builder = {
        order: jest.fn(),
        range,
      };
      builder.order.mockReturnValue(builder);
      return builder;
    });
    const countQuery = { is: jest.fn(async () => ({ count: 1200, error: null })) };
    const from = jest.fn(() => ({ select: jest.fn(() => countQuery) }));
    mockCreateAdminClient.mockReturnValue({
      schema: jest.fn(() => ({ rpc, from })),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1200);
    expect(body.drifted).toBe(1001);
    expect(body.rows).toHaveLength(1001);
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0][0]).toBe(0);
    expect(rpc).toHaveBeenCalledWith("user_preferences_drift_report", undefined, { count: "exact" });
  });
});
