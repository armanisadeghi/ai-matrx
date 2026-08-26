/** @jest-environment node */
/**
 * The HR contract client's organization-context binding.
 *
 * WHY THIS SUITE EXISTS: every `/hr/*` and `/esign/*` operation declares `X-Organization-Id`
 * REQUIRED (SPEC-CONTRACTS §1.2), and `lib/api/hr-contract-client.ts` reaches the network through
 * `getJson`/`postJson` rather than through `callApi` — the only place the fail-closed kernel was
 * wired. The gap was invisible in mock mode and would have surfaced as a wall of 400s the day the
 * real handlers land. These tests hold the wiring closed from BOTH ends: the client resolves the
 * selected org, and the transport actually puts it on the wire.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => null,
  getStoreSingleton: () => null,
}));
jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));
// The fixture registry pulls 243 JSON files in; this suite is about the LIVE transport, so the
// mock lane is stubbed off rather than loaded.
jest.mock("@/features/hr/mock/transport", () => ({
  HR_MOCK_ENABLED: false,
  serveFromFixtures: () => null,
}));
jest.mock("@/lib/organizations/activeOrg", () => ({
  requireSelectedOrgId: jest.fn(),
}));

import { hrApiGet, hrApiPost } from "@/lib/api/hr-contract-client";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";

const requireSelectedOrgIdMock = jest.mocked(requireSelectedOrgId);

const ORGANIZATION_ID = "1b2c3d4e-5f60-4a71-8b92-0c1d2e3f4a5b";
const OTHER_ORGANIZATION_ID = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";

function okFetch() {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(JSON.stringify({ formats: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  global.fetch = fetchMock;
  return fetchMock;
}

function headersOf(fetchMock: ReturnType<typeof okFetch>): Record<string, string> {
  return (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
    string,
    string
  >;
}

describe("hr-contract-client organization context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSelectedOrgIdMock.mockReturnValue(ORGANIZATION_ID);
  });

  it("stamps X-Organization-Id from the selected org on a GET", async () => {
    const fetchMock = okFetch();
    await hrApiGet("/hr/exports/formats", {
      baseUrlOverride: "https://hr.example.test",
    });
    expect(headersOf(fetchMock)["X-Organization-Id"]).toBe(ORGANIZATION_ID);
  });

  it("stamps X-Organization-Id and X-Idempotency-Key on a mutating POST", async () => {
    const fetchMock = okFetch();
    await hrApiPost(
      "/hr/exports/payroll/preview",
      {
        organization_id: ORGANIZATION_ID,
        pay_period_id: "00000000-0000-4000-8000-000000000041",
        export_format: "generic_csv",
      },
      {
        baseUrlOverride: "https://hr.example.test",
        idempotencyKey: "intent-key-reused-across-retries",
      },
    );
    const headers = headersOf(fetchMock);
    expect(headers["X-Organization-Id"]).toBe(ORGANIZATION_ID);
    expect(headers["X-Idempotency-Key"]).toBe(
      "intent-key-reused-across-retries",
    );
  });

  it("prefers an explicit organizationId over the selected org", async () => {
    const fetchMock = okFetch();
    await hrApiGet("/hr/exports/formats", {
      baseUrlOverride: "https://hr.example.test",
      organizationId: OTHER_ORGANIZATION_ID,
    });
    expect(headersOf(fetchMock)["X-Organization-Id"]).toBe(
      OTHER_ORGANIZATION_ID,
    );
    expect(requireSelectedOrgIdMock).not.toHaveBeenCalled();
  });

  it("fails BEFORE networking when no organization is selected", async () => {
    const fetchMock = okFetch();
    requireSelectedOrgIdMock.mockImplementation(() => {
      throw new Error("Select an organization before sending this request.");
    });
    await expect(
      hrApiGet("/hr/exports/formats", {
        baseUrlOverride: "https://hr.example.test",
      }),
    ).rejects.toThrow("Select an organization");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed organization id instead of normalizing it", async () => {
    const fetchMock = okFetch();
    requireSelectedOrgIdMock.mockReturnValue("personal-default");
    await expect(
      hrApiGet("/hr/exports/formats", {
        baseUrlOverride: "https://hr.example.test",
      }),
    ).rejects.toThrow(/organization/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
