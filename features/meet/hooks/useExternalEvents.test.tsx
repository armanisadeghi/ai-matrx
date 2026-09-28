import { renderHook, settle } from "@/test-utils/renderHook";
import { useExternalEvents } from "./useExternalEvents";

const limit = jest.fn();
const order = jest.fn(() => ({ limit }));
const lte = jest.fn(() => ({ order }));
const gte = jest.fn(() => ({ lte }));
const eq = jest.fn(() => ({ gte }));
const is = jest.fn(() => ({ eq }));
const or = jest.fn(() => ({ is }));
const select = jest.fn(() => ({ or }));
const from = jest.fn(() => ({ select }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ from })) },
}));

describe("useExternalEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps a calendar read outage visible instead of presenting an empty agenda", async () => {
    limit.mockResolvedValueOnce({
      data: null,
      error: { message: "Calendar is unavailable." },
    });

    const hook = await renderHook(() => useExternalEvents("member-73", true));

    await settle(
      hook,
      (value) => value.failure !== null,
      "calendar read failure",
    );
    expect(hook.current).toMatchObject({
      loading: false,
      failure: "Calendar is unavailable.",
      events: [],
    });
    await hook.unmount();
  });
});
