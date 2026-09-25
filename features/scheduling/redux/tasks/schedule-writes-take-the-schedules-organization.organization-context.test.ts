// ORG-GATE-AUDIT (VERIFIER-20 #1). On a schedule's own page with no
// organization selected, Pause flipped to Enable and sent nothing (the picker
// was waiting behind the flipped control), and Delete confirmed "This cannot be
// undone" and sent nothing. A write to ONE schedule takes the SCHEDULE'S OWN
// organization — the object names it — and never asks; and a toggle whose
// organization still has to be asked never flips before the answer.
// Fails against the pre-fix thunks (no organization passed, flip first).
const getSession = jest.fn();
const getStoreState = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: getStoreState }),
}));
jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "https://server.example.test",
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
import { deleteScheduledTask, toggleTaskEnabled } from "./thunks";

const TASK_ID = "66666666-6666-4666-8666-666666666666";

function thunkState(organizationId: string | null, enabled = true) {
  return () => ({
    schedulingTasks: {
      byId: { [TASK_ID]: { id: TASK_ID, organizationId, enabled, title: "Harbor Point weekly walk-through reminder" } },
      mutation: {},
    },
  }) as never;
}

describe("a schedule's writes take the schedule's own organization", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getStoreState, null);
  });
  afterEach(resetGate);

  it("Pause with no organization selected sends in the schedule's organization and never asks", async () => {
    const fetchMock = mockFetchJson({ id: TASK_ID, enabled: false });
    const opened = mountPickerAnswering(CHOSEN_ORG);
    const dispatch = jest.fn((a) => a);

    await toggleTaskEnabled(TASK_ID, false)(dispatch, thunkState(SELECTED_ORG), undefined);

    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(SELECTED_ORG);
  });

  it("Delete with no organization selected sends in the schedule's organization and never asks", async () => {
    const fetchMock = mockFetchJson({ id: TASK_ID, deleted: true });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await deleteScheduledTask(TASK_ID)(jest.fn((a) => a), thunkState(SELECTED_ORG), undefined);

    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(SELECTED_ORG);
  });

  it("a row with no organization loaded does not flip while the question is open, and a cancel flips nothing", async () => {
    const fetchMock = mockFetchJson({});
    const opened = mountPickerAnswering(null); // the person closes the picker
    const dispatch = jest.fn((a) => a);

    await expect(
      toggleTaskEnabled(TASK_ID, false)(dispatch, thunkState(null), undefined),
    ).rejects.toMatchObject({ name: "OrganizationSelectionCancelled" });

    expect(opened).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
