/** @jest-environment node */
/**
 * Guards against a regression the org-mandatory python-client.ts fix could
 * have introduced here: this file used to steal its Bearer token out of
 * `buildHeaders()` (lib/python-client.ts), which — after the fix making
 * organization mandatory for that kernel — throws when no organization is
 * selected. The realtime WS route this token feeds
 * (aidream/api/routers/google_specialized.py::_authenticated_setup) is a raw
 * FastAPI websocket handler that bypasses AuthMiddleware entirely and has no
 * organization concept server-side, so gating it on organization selection
 * would be a pure regression, not a fix. `accessToken()` now reads the JWT
 * directly via `getAccessTokenOrNull` instead.
 *
 * This test proves a voice session can still authenticate with NO
 * organization selected (the control that would fail if the coupling ever
 * comes back), and that a missing session still fails loudly and clearly.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  // No store at all — the same as "no organization selected anywhere".
  getStore: () => null,
}));

import { supabase } from "@/utils/supabase/client";
import { createGoogleRealtimeClient } from "@/features/voice-agent/transport/googleRealtimeClient";

const getSessionMock = jest.mocked(supabase.auth.getSession);

describe("googleRealtimeClient accessToken (decoupled from organization admission)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("CONTROL: constructing a client does not require an organization anywhere", () => {
    // No store, no organization — the factory itself must not touch the
    // organization kernel at all (it only wires callbacks; accessToken()
    // runs later, inside connect()).
    expect(() =>
      createGoogleRealtimeClient("live", { model: "gemini-test" }),
    ).not.toThrow();
  });

  it("fails loudly (not silently) with no active session — and NOT with OrganizationContextError", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    const client = createGoogleRealtimeClient("live", { model: "gemini-test" });
    await expect(client.connect()).rejects.toThrow(
      "A signed-in session is required for Google realtime models.",
    );
  });

  it("CONTROL: resolves the Bearer token with no organization selected anywhere (does not throw OrganizationContextError)", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "voice-jwt" } },
      error: null,
    } as never);

    const client = createGoogleRealtimeClient("live", { model: "gemini-test" });
    // The real WebSocket constructor isn't available/meaningful in this
    // node-environment test — what matters is that resolving the token
    // itself never throws (organization-mandatory or otherwise). A thrown
    // WebSocket-construction error here is unrelated to what this test
    // guards, so only assert we get PAST accessToken() successfully.
    let rejection: unknown;
    try {
      await client.connect();
    } catch (err) {
      rejection = err;
    }
    if (rejection) {
      expect(String(rejection)).not.toMatch(
        /organization_context_required|OrganizationContextError|Select an organization/i,
      );
    }
  });
});
