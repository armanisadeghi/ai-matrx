// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, organizationContextHeaders read the selection into the bare kernel
// synchronously: disconnecting Bing or pressing Connect with no organization
// selected threw and the picker never opened.
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
import { disconnectBing, startBingOAuth } from "./service";

describe("Bing Webmaster — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("disconnecting with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({});
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await disconnectBing("conn-bing-1");

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("pressing Connect (a GET, but the person's act) also asks", async () => {
    const fetchMock = mockFetchJson({ authorize_url: "https://www.bing.com/webmasters/oauth" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await startBingOAuth({ type: "user" } as Parameters<typeof startBingOAuth>[0]).catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });
});
