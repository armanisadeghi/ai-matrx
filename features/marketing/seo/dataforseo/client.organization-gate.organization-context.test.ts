// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, organizationContextHeaders was synchronous over the bare kernel:
// starting a DataForSEO collection with no organization selected threw and the
// picker never opened.
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
import {
  createDataForSeoCollection,
  listDataForSeoOperations,
} from "./client";

describe("DataForSEO client — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("starting a collection with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({ run_id: "run-1" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await createDataForSeoCollection("https://seo.example.test", "jwt", {
      operation: "serp.google.organic",
    } as unknown as Parameters<typeof createDataForSeoCollection>[2]);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("listing operations (a read) never opens the picker", async () => {
    const fetchMock = mockFetchJson({ operations: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(
      listDataForSeoOperations("https://seo.example.test", "jwt"),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
