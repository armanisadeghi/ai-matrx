// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, authHeaders called requireOrganizationContext(requireSelectedOrgId())
// — deleting or saving a Vault item with no organization selected was a bare
// refusal and the picker never opened. The actor freeze (import/export) must
// still NEVER ask: it compares the organization before and after a send.
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  };
  return { createClient: () => client, supabase: client };
});
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "user-1", email: "ops@acme-dental.test" } }, error: null }),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

import {
  CHOSEN_ORG,
  SELECTED_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { deleteVaultItem, getVaultImportActor } from "./vault-service";

describe("Vault service — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("deleting an item with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson(undefined, 204);
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await deleteVaultItem("item-1").catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("the import actor freeze never opens the picker (an identity read)", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);
    await expect(getVaultImportActor()).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(opened).not.toHaveBeenCalled();
  });

  it("the actor freeze reads the selected organization when there is one", async () => {
    selectOrganization(getState, SELECTED_ORG);
    await expect(getVaultImportActor()).resolves.toEqual({
      userId: "user-1",
      organizationId: SELECTED_ORG,
    });
  });
});
