import { coppaService } from "./coppaService";

const getSession = jest.fn();
const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

describe("coppaService.getGate session boundary", () => {
  beforeEach(() => {
    getSession.mockReset();
    rpc.mockReset();
  });

  it("returns the no-subject verdict without calling the authenticated RPC", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(coppaService.getGate()).resolves.toEqual({
      data: {
        ageBand: null,
        requiresConsent: false,
        hasActiveGuardian: false,
        hasVerifiedGuardian: false,
        isAnonymous: false,
        aiAllowed: true,
        reason: "allowed",
      },
      error: null,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the authoritative RPC when a Supabase subject exists", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: {
        age_band: "adult",
        requires_consent: false,
        has_active_guardian: false,
        has_verified_guardian: false,
        is_anonymous: false,
        ai_allowed: true,
        reason: "allowed",
      },
      error: null,
    });

    await expect(coppaService.getGate()).resolves.toMatchObject({
      data: { ageBand: "adult", aiAllowed: true, reason: "allowed" },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("edu_coppa_gate");
  });
});
