/** @jest-environment node */

import { NextRequest } from "next/server";

const mockRequireAdmin = jest.fn();
const mockCreateClient = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

jest.mock("@/utils/auth/adminUtils", () => ({
  requireAdmin: mockRequireAdmin,
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: mockCreateClient,
}));

import { DELETE, PUT } from "./route";

const TOOL_ID = "03fa8c2f-a275-41d7-a8a9-da6a67762fe3";
const context = { params: Promise.resolve({ id: TOOL_ID }) };

function request(method: "PUT" | "DELETE", body?: Record<string, unknown>) {
  return new NextRequest(`https://www.aimatrx.com/api/admin/tools/${TOOL_ID}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue("87a6e699-1111-4111-8111-111111111111");
  mockSingle.mockResolvedValue({ data: { id: TOOL_ID }, error: null });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockIs.mockReturnValue({ select: mockSelect });
  mockEq.mockReturnValue({ is: mockIs, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  const from = jest.fn(() => ({ update: mockUpdate }));
  const schema = jest.fn(() => ({ from }));
  mockCreateClient.mockResolvedValue({ schema });
});

describe("tool registry mutation routes", () => {
  it("keeps identity, tenancy, provenance, deletion, and policy fields out of PUT", async () => {
    const response = await PUT(
      request("PUT", {
        name: "forged_name",
        organization_id: "forged-org",
        created_by: "forged-owner",
        deleted_at: "2020-01-01T00:00:00Z",
        source_kind: "mcp_discovered",
        managed_by_server_id: "forged-server",
        visibility: "public",
        admin_only: true,
        gating: ["forged"],
        description: "Safe edit",
        semver: "2.3.4",
        version: 7,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      description: "Safe edit",
      semver: "2.3.4",
      version: 7,
    });
  });

  it.each(["2", "v2.0.0", "2.0.0-beta"])(
    "rejects noncanonical PUT semver %p",
    async (semver) => {
      const response = await PUT(request("PUT", { semver }), context);

      expect(response.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it("soft deletes through the authenticated writer after the admin gate", async () => {
    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(200);
    expect(mockRequireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateClient.mock.invocationCallOrder[0],
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      deleted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(mockEq).toHaveBeenCalledWith("id", TOOL_ID);
    expect(mockIs).toHaveBeenCalledWith("deleted_at", null);
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(mockEq.mock.invocationCallOrder[0]).toBeLessThan(
      mockIs.mock.invocationCallOrder[0],
    );
    expect(mockIs.mock.invocationCallOrder[0]).toBeLessThan(
      mockSelect.mock.invocationCallOrder[0],
    );
  });

  it("returns the same generic 404 when no visible live row was deleted", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
      },
    });

    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Tool not found" });
  });
});
