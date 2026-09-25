// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, organizationContextHeaders read the selection into the bare kernel
// synchronously: cancelling (or starting) a crawl with no organization
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

jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "https://scraper.example.test",
}));
import {
  CHOSEN_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { cancelCrawl } from "./direct-client";

describe("site crawler — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("cancelling a crawl with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({});
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await cancelCrawl("crawl-session-1");

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("without a picker it keeps the fail-closed refusal before networking", async () => {
    const fetchMock = mockFetchJson({});
    await expect(cancelCrawl("crawl-session-1")).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
