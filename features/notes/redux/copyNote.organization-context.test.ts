// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, duplicating a note someone SHARED with you homed the copy with
// requireOrganizationContext(selectOrganizationId(state)) — with no
// organization selected, pressing Duplicate was a bare refusal and the picker
// never opened. A note you own keeps its own organization and never asks.
const getStoreState = jest.fn();
const single = jest.fn();
const insert = jest.fn((_row: Record<string, unknown>) => ({ select: () => ({ single }) }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => ({ insert }) }) },
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: getStoreState }),
}));

import {
  CHOSEN_ORG,
  SELECTED_ORG,
  mountPickerAnswering,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { copyNote } from "./thunks";

const NOTE_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "44444444-4444-4444-8444-444444444444";

function thunkState(sharedWithMe: boolean) {
  return () => ({
    userAuth: { id: USER_ID },
    appContext: { organization_id: null },
    notes: {
      notes: {
        [NOTE_ID]: {
          id: NOTE_ID,
          label: "Onboarding checklist",
          content: "Day one: accounts, keys, intro calls.",
          folder_name: "Team",
          tags: [],
          organization_id: SELECTED_ORG,
          _sharedWithMe: sharedWithMe,
        },
      },
    },
  });
}

describe("copyNote — organization gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGate();
    selectOrganization(getStoreState, null);
    single.mockResolvedValue({
      data: { id: "copy-1", label: "Onboarding checklist (Copy)", organization_id: CHOSEN_ORG },
      error: null,
    });
  });
  afterEach(resetGate);

  it("duplicating a note shared with me, with no organization selected, asks and files the copy in the answer", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);
    const result = await copyNote({ noteId: NOTE_ID })(jest.fn((a) => a), thunkState(true), undefined);

    expect(copyNote.fulfilled.match(result)).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ organization_id: CHOSEN_ORG });
  });

  it("duplicating my own note keeps its organization and never asks", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);
    await copyNote({ noteId: NOTE_ID })(jest.fn((a) => a), thunkState(false), undefined);

    expect(opened).not.toHaveBeenCalled();
    expect(insert.mock.calls[0][0]).toMatchObject({ organization_id: SELECTED_ORG });
  });
});
