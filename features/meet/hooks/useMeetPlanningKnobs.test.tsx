import { renderHook, settle } from "@/test-utils/renderHook";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMeetPlanningKnobs } from "./useMeetPlanningKnobs";

const rpc = jest.fn();
const setKnobOverride = jest.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

  it("keeps an optimistic save when the settings read started before that save finishes", async () => {
    const reads = Array.from({ length: 7 }, () =>
      deferred<{ data: null; error: null }>(),
    );
    let nextRead = 0;
    rpc.mockImplementation(() => {
      const read = reads[nextRead++];
      if (!read) throw new Error("Unexpected extra planning read.");
      return read.promise;
    });
    setKnobOverride.mockResolvedValue({ ok: true });

    const hook = await renderHook(() =>
      useMeetPlanningKnobs("org-recycling", "member-73"),
    );
    await hook.act(async () => {
      await Promise.resolve();
    });
    expect(rpc).toHaveBeenCalledTimes(7);

    // The post-save refresh is not part of the old, already-started read.
    rpc.mockResolvedValue({ data: false, error: null });
    await hook.act(() => hook.current.setShowExternalEvents(false));
    expect(hook.current.showExternalEvents).toBe(false);

    await hook.act(async () => {
      reads.forEach((read) => read.resolve({ data: null, error: null }));
      await Promise.all(reads.map((read) => read.promise));
    });

    expect(hook.current).toMatchObject({
      showExternalEvents: false,
      failure: null,
    });
    await hook.unmount();
  });

  it("keeps an optimistic save while the selected organization starts a read before that save settles", async () => {
    const write = deferred<{ ok: true }>();
    setKnobOverride.mockReturnValue(write.promise);
    rpc.mockResolvedValue({ data: null, error: null });

    let latest!: ReturnType<typeof useMeetPlanningKnobs>;
    let selectOrganization!: (id: string) => void;
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    function Probe() {
      const [organizationId, setOrganizationId] = React.useState<string | null>(
        null,
      );
      latest = useMeetPlanningKnobs(organizationId, "member-73");
      selectOrganization = setOrganizationId;
      return null;
    }

    await act(async () => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    await waitForPlanning(() => latest.loaded);

    let saving!: Promise<void>;
    await act(async () => {
      saving = latest.setShowExternalEvents(false, "org-recycling");
      await Promise.resolve();
    });
    expect(latest.showExternalEvents).toBe(false);

    const staleReads = Array.from({ length: 7 }, () =>
      deferred<{ data: boolean; error: null }>(),
    );
    let nextRead = 0;
    rpc.mockImplementation(() => {
      const read = staleReads[nextRead++];
      if (!read) throw new Error("Unexpected extra planning read.");
      return read.promise;
    });
    await act(async () => {
      selectOrganization("org-recycling");
    });
    expect(rpc).toHaveBeenCalledTimes(14);

    await act(async () => {
      staleReads.forEach((read) => read.resolve({ data: true, error: null }));
      await Promise.all(staleReads.map((read) => read.promise));
    });
    expect(latest.showExternalEvents).toBe(false);

    rpc.mockResolvedValue({ data: false, error: null });
    await act(async () => {
      write.resolve({ ok: true });
      await saving;
    });
    await waitForPlanning(() => latest.loaded && !latest.showExternalEvents);

    await act(async () => root.unmount());
    container.remove();
  });
});

async function waitForPlanning(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error("Timed out waiting for planning settings.");
}
