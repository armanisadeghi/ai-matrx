/**
 * The agent cache-bust lane names its organization.
 *
 * WHY THIS SUITE EXISTS: on 2026-08-30 the server's AuthMiddleware began
 * refusing every authenticated request that carries no `X-Organization-Id`
 * (400 `organization_required`) before it routes. This lane builds its request
 * headers by hand — Authorization or fingerprint, nothing else — so every
 * cache bust a signed-in person triggered died at the door; production logged
 * the rejects on `POST /ai/agents/{id}/invalidate-cache` after the gate went
 * live. The organization is transport identity, so it is bound where the
 * bearer token is bound, and these are the guards for that.
 */

import type { RootState } from "@/lib/redux/store";
import { resolveAgentCacheBustBackend } from "../agent-cache-bust-request";

const ORGANIZATION_ID = "f9cb3e35-1b2c-4d5e-8f60-71a2b3c4d5e6";
const BASE_URL = "https://server.app.matrxserver.com";

function stateWith(overrides: {
  accessToken?: string | null;
  fingerprintId?: string | null;
  organizationId?: string | null;
}): RootState {
  return {
    apiConfig: {
      activeServer: "production",
      serviceOverrides: {},
      customUrl: BASE_URL,
      resolvedBaseUrl: BASE_URL,
    },
    userAuth: {
      accessToken: overrides.accessToken ?? null,
      authReady: true,
    },
    userProfile: {
      fingerprintId: overrides.fingerprintId ?? null,
      shellDataLoaded: true,
    },
    appContext: { organization_id: overrides.organizationId ?? null },
  } as unknown as RootState;
}

describe("resolveAgentCacheBustBackend organization admission", () => {
  it("attaches X-Organization-Id alongside the bearer token", () => {
    const backend = resolveAgentCacheBustBackend(
      stateWith({ accessToken: "jwt-1", organizationId: ORGANIZATION_ID }),
    );

    expect(backend).not.toBeNull();
    expect(backend!.headers["Authorization"]).toBe("Bearer jwt-1");
    expect(backend!.headers["X-Organization-Id"]).toBe(ORGANIZATION_ID);
  });

  it("refuses — loudly — rather than send an authenticated request with no organization", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const backend = resolveAgentCacheBustBackend(
      stateWith({ accessToken: "jwt-1", organizationId: null }),
    );

    expect(backend).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no active organization"),
    );
    warn.mockRestore();
  });

  it("leaves the fingerprint-guest lane organization-free", () => {
    const backend = resolveAgentCacheBustBackend(
      stateWith({ fingerprintId: "fp-1" }),
    );

    expect(backend).not.toBeNull();
    expect(backend!.headers["X-Fingerprint-ID"]).toBe("fp-1");
    expect(backend!.headers["X-Organization-Id"]).toBeUndefined();
  });
});
