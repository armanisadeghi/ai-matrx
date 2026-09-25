// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, authHeaders called requireOrganizationContext(requireSelectedOrgId())
// — enrolling an authenticator with no organization selected was a bare
// refusal and the picker never opened.
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  };
  return { createClient: () => client, supabase: client };
});
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

import {
  CHOSEN_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { enrollAuthenticator, fetchAuthenticatorCode } from "./authenticator-service";

describe("authenticator — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("enrolling with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({ credential_item_id: "cred-1" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await enrollAuthenticator("cred-1", "otpauth://totp/Acme:ops?secret=JBSWY3DPEHPK3PXP");

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("the polled current-code read never opens the picker", async () => {
    const fetchMock = mockFetchJson({ code: "123456" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(fetchAuthenticatorCode("cred-1")).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
