/** @jest-environment node */
import { NextRequest } from "next/server";

const mockCreateClient = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockGetClaimsUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({ createClient: mockCreateClient }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: mockCreateAdminClient }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: mockGetClaimsUser }));
import { POST } from "./route";

const mockAdminRow = jest.fn();
const mockServerRow = jest.fn();
const mockUpdate = jest.fn();
const mockRoleFilter = jest.fn();
const mockFetch = jest.fn();
const originalFetch = global.fetch;
const userId = "87a6e699-1111-4111-8111-111111111111";
const serverId = "d3b8cbd1-6a19-4eca-8b1f-7136e2ea57cc";
const request = () => new NextRequest(`http://localhost/api/admin/mcp/${serverId}/test`, { method: "POST" });
const context = () => ({ params: Promise.resolve({ serverId }) });

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockGetClaimsUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mockAdminRow.mockResolvedValue({ data: { level: "super_admin" }, error: null });
  mockRoleFilter.mockReturnValue({ maybeSingle: mockAdminRow });
  mockServerRow.mockResolvedValue({ data: { id: serverId, slug: "reference-docs", name: "Reference docs", transport: "http", endpoint_url: "https://example.com/mcp" }, error: null });
  mockCreateClient.mockResolvedValue({ schema: (schema: string) => ({ from: (table: string) => {
    if (schema === "admin" && table === "admins") return { select: () => ({ eq: mockRoleFilter }) };
    if (schema === "tool" && table === "mcp_server") return { select: () => ({ eq: () => ({ single: mockServerRow }) }) };
    throw new Error(`Unexpected relation ${schema}.${table}`);
  } }) });
  mockUpdate.mockReturnValue({ eq: () => ({ select: () => Promise.resolve({ data: [{ id: serverId }], error: null }) }) });
  mockCreateAdminClient.mockReturnValue({ schema: () => ({ from: () => ({ update: mockUpdate }) }) });
  mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
});
afterAll(() => { global.fetch = originalFetch; });

it.each([null, "developer", "senior_admin"])("refuses role %p before endpoint probing or privileged persistence", async level => {
  mockAdminRow.mockResolvedValue({ data: level === null ? null : { level }, error: null });
  const response = await POST(request(), context());
  expect(response.status).toBe(403);
  expect(mockServerRow).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockCreateAdminClient).not.toHaveBeenCalled();
});

it("refuses an anonymous request before looking up the server", async () => {
  mockGetClaimsUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await POST(request(), context())).status).toBe(401);
  expect(mockServerRow).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it.each([204, 503])("lets a super admin probe and persist the actual HTTP %i outcome", async status => {
  mockFetch.mockResolvedValue(new Response(null, { status }));
  const response = await POST(request(), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ statusCode: status, ok: status < 500, reachable: status < 500 });
  expect(mockRoleFilter).toHaveBeenCalledWith("user_id", userId);
  expect(mockFetch).toHaveBeenCalledWith("https://example.com/mcp", expect.objectContaining({ method: "GET", redirect: "manual" }));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ last_test_status_code: status, last_test_ok: status < 500 }));
});

it("fails closed when the admin lookup reports an error", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockAdminRow.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    expect((await POST(request(), context())).status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
