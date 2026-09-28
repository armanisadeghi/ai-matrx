import { renderHook, settle } from "@/test-utils/renderHook";
import { useMeetPlanningKnobs } from "./useMeetPlanningKnobs";

const rpc = jest.fn();
const setKnobOverride = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ rpc })) },
}));

jest.mock("@/lib/scoped-config/service", () => ({
  knobRefusalSentence: () => "The setting could not be saved.",
  setKnobOverride: (...args: unknown[]) => setKnobOverride(...args),
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

  it("retries a failed planning read and only then enables the successful default", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Settings offline." },
    });
    const hook = await renderHook(() =>
      useMeetPlanningKnobs("org-recycling", "member-73"),
    );
    await settle(
      hook,
      (value) => value.failure !== null,
      "initial settings failure",
    );
    rpc.mockResolvedValue({ data: null, error: null });
    await hook.act(() => hook.current.retry());
    await settle(
      hook,
      (value) => value.loaded && value.showExternalEvents,
      "retried settings success",
    );
    await hook.unmount();
  });

  it("saves through the organization chosen after the hook first rendered without one", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    setKnobOverride.mockResolvedValue({ ok: true });

    const hook = await renderHook(() =>
      useMeetPlanningKnobs(null, "member-73"),
    );
    await settle(hook, (value) => value.loaded, "planning defaults");

    await hook.act(() =>
      hook.current.setShowExternalEvents(false, "org-recycling"),
    );
    expect(setKnobOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-recycling",
        scopeId: "member-73",
        value: false,
      }),
    );
    await hook.unmount();
  });
});
