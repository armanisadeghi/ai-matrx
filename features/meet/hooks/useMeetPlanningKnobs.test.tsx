import { renderHook, settle } from "@/test-utils/renderHook";
import { useMeetPlanningKnobs } from "./useMeetPlanningKnobs";

const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ rpc })) },
}));

describe("useMeetPlanningKnobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not mark defaults loaded or silently enable calendar events when the settings read fails", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Planning settings are unavailable." },
    });

    const hook = await renderHook(() =>
      useMeetPlanningKnobs("org-recycling", "member-73"),
    );

    await settle(
      hook,
      (value) => value.failure !== null,
      "planning settings failure",
    );
    expect(hook.current).toMatchObject({
      loaded: false,
      failure: "Planning settings are unavailable.",
      showExternalEvents: false,
    });
    await hook.unmount();
  });
});
