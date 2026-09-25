// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, authedDirectiveHeaders was synchronous and read the selection into
// the bare kernel: running a directive with no organization selected threw
// before the request and the picker never opened.
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
import { executeDirective } from "./service";

describe("directive catalog — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("executing a directive with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({ status: "applied", results: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await executeDirective("https://server.example.test", {
      directive: "project.create",
      params: { name: "Spring launch" },
    } as unknown as Parameters<typeof executeDirective>[1]).catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("without a picker it keeps the fail-closed refusal before networking", async () => {
    const fetchMock = mockFetchJson({});
    await expect(
      executeDirective("https://server.example.test", {} as Parameters<typeof executeDirective>[1]),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
