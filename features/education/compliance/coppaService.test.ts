import { coppaService } from "./coppaService";

const getSession = jest.fn();
const rpc = jest.fn();
const ensureOrgId = jest.fn();
const captureError = jest.fn();

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (...args: unknown[]) => ensureOrgId(...args),
}));

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

    await expect(coppaService.getGate({ force: true })).resolves.toMatchObject({
      data: { ageBand: "adult", aiAllowed: true, reason: "allowed" },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("edu_coppa_gate");
  });
});

describe("coppaService.setAgeBand writes even before an organization resolves", () => {
  it("still calls edu_set_age_band when no active organization is set", async () => {
    rpc.mockReset();
    ensureOrgId.mockRejectedValue(new Error("organization_context_required"));
    rpc.mockResolvedValue({ data: { status: "ok", age_band: "adult", reason: "set" }, error: null });
    const res = await coppaService.setAgeBand("adult");
    expect(rpc).toHaveBeenCalledWith("edu_set_age_band", { p_band: "adult" });
    expect(res.error).toBeNull();
    // Never silent: the missing organization is said once, at a low tier.
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ code: "coppa-age-band-no-active-organization", level: "low", recoverable: true }));
  });

  it("says nothing when the organization resolves", async () => {
    rpc.mockReset();
    captureError.mockReset();
    ensureOrgId.mockResolvedValue("org-1");
    rpc.mockResolvedValue({ data: { status: "ok", age_band: "adult", reason: "set" }, error: null });
    await coppaService.setAgeBand("adult");
    expect(rpc).toHaveBeenCalledWith("edu_set_age_band", { p_band: "adult", p_organization_id: "org-1" });
    expect(captureError).not.toHaveBeenCalled();
  });
});
