const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = { auth: { getSession: (...args: unknown[]) => getSession(...args) } };
  return { createClient: () => client, supabase: client };
});
// getStore is the singleton's own alias; lib/python-client (resolveBaseUrl, reached via the Google service) reads it.
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
  getStore: () => ({ getState }),
}));

import { CHOSEN_ORG, mockFetchJson, organizationHeaderOf, resetGate, selectOrganization } from "@/lib/organization/__tests__/gate-harness";
import { previewSelectedFormResponses } from "./service";

beforeEach(() => {
  jest.resetAllMocks();
  resetGate();
  getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  selectOrganization(getState, CHOSEN_ORG);
});
afterEach(resetGate);

it("serializes the exact selected source and page through the canonical transport with its organization header", async () => {
  const fetchMock = mockFetchJson({
    status: "ready",
    provenance: { form_id: "form-1", form_title: "Survey", connection_id: "account-1", account_label: "person@example.com", organization_id: CHOSEN_ORG },
    responses: [],
  });
  await previewSelectedFormResponses({ organization_id: CHOSEN_ORG, connection_id: "account-1", form_id: "form-1", page_token: "opaque-page" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain("/google-integrations/forms/responses/preview");
  expect(JSON.parse(init.body as string)).toEqual({ organization_id: CHOSEN_ORG, connection_id: "account-1", form_id: "form-1", page_token: "opaque-page" });
  expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
});
