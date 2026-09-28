/** @jest-environment node */

import { NextRequest } from "next/server";

const mockRequireAdmin = jest.fn();
const mockCreateClient = jest.fn();
const mockResolveSystemOrgId = jest.fn();

jest.mock("@/utils/auth/adminUtils", () => ({
  requireAdmin: mockRequireAdmin,
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: mockCreateClient,
}));
jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: mockResolveSystemOrgId,
}));

import { POST } from "./route";

const ADMIN_ID = "87a6e699-1111-4111-8111-111111111111";
const ORG_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSingle = jest.fn();
const mockSameName = jest.fn();

function request(body: Record<string, unknown>) {
  return new NextRequest("https://www.aimatrx.com/api/admin/tools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "storage_source_import",
      description: "Import one exact connected storage item.",
      parameters: { type: "object", properties: {} },
      ...body,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_ID);
  mockResolveSystemOrgId.mockResolvedValue(ORG_ID);
  mockSingle.mockResolvedValue({
    data: { id: "tool-1", name: "storage_source_import" },
    error: null,
  });
  mockSameName.mockResolvedValue({ data: null, error: null });
  const select = jest.fn(() => ({ single: mockSingle }));
  mockInsert.mockReturnValue({ select });
  mockUpdate.mockReturnValue({ eq: jest.fn(() => ({ select })) });
  const lookup = jest.fn(() => ({
    eq: jest.fn(() => ({ maybeSingle: mockSameName })),
  }));
  const from = jest.fn(() => ({
    insert: mockInsert,
    update: mockUpdate,
    select: lookup,
  }));
  const schema = jest.fn(() => ({ from }));
  mockCreateClient.mockResolvedValue({ schema });
});

describe("tool registry create route", () => {
  it.each(["1.0.0", "1"])(
    "rejects string revision %p before the database write",
    async (version) => {
      const response = await POST(request({ version }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Version must be a positive integer",
      });
      expect(mockInsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    [1, "1.0.0"],
    [7, "2.4.1"],
  ])(
    "writes integer revision %i separately from semantic version %s",
    async (version, semver) => {
      const response = await POST(
        request({
          version,
          semver,
          actor_system: "forged-client-value",
          tool_group: "storage",
          side_effect_class: "db_write",
          visibility: "public",
        }),
      );

      expect(response.status).toBe(201);
      expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockRequireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        mockCreateClient.mock.invocationCallOrder[0],
      );
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          version,
          semver,
          organization_id: ORG_ID,
          tool_group: "storage",
          side_effect_class: "db_write",
          visibility: "public",
        }),
      ]);
      expect(mockInsert.mock.calls[0][0][0]).not.toHaveProperty("actor_system");
    },
  );

  it.each(["1", "v1.0.0", "1.0", "1.0.0-beta"])(
    "rejects noncanonical semantic version %p before the database write",
    async (semver) => {
      const response = await POST(request({ version: 1, semver }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Semantic version must use major.minor.patch format",
      });
      expect(mockInsert).not.toHaveBeenCalled();
    },
  );

  it("revives a tool in Trash that holds the same name instead of inserting", async () => {
    mockSameName.mockResolvedValue({
      data: { id: "archived-tool", deleted_at: "2026-09-27T00:00:00Z" },
      error: null,
    });
    const response = await POST(request({ version: 1, semver: "1.0.0" }));

    expect(response.status).toBe(201);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "storage_source_import", deleted_at: null }),
    );
    expect((await response.json()).revived).toBe(true);
  });

  it("refuses a name a live tool already holds, with a remedy", async () => {
    mockSameName.mockResolvedValue({
      data: { id: "live-tool", deleted_at: null },
      error: null,
    });
    const response = await POST(request({ version: 1, semver: "1.0.0" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already exists/);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
