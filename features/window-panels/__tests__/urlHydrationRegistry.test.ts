import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "../registry/overlay-ids";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import { initUrlHydration } from "../url-sync/initUrlHydration";
import { getHydrator } from "../url-sync/UrlPanelRegistry";

function hydrate(typeKey: string, instanceId: string) {
  const dispatch = jest.fn();
  const hydrator = getHydrator(typeKey);

  expect(hydrator).toBeDefined();
  hydrator?.(dispatch, instanceId, {});

  return dispatch;
}

describe("URL hydration registry", () => {
  beforeAll(() => {
    initUrlHydration();
  });

  it("has a hydrator for every registry urlSync key", () => {
    const missing = ALL_WINDOW_STATIC_METADATA.flatMap((entry) => {
      const key = entry.urlSync?.key;
      return key && !getHydrator(key)
        ? [{ overlayId: entry.overlayId, key }]
        : [];
    });

    expect(missing).toEqual([]);
  });

  it("hydrates Creator Hub with an optional tab", () => {
    expect(hydrate("creator_hub", "creatorHub")).toHaveBeenCalledWith(
      openOverlay({ overlayId: "creatorHub", data: null }),
    );
    expect(hydrate("creator_hub", "routing")).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "creatorHub",
        data: { initialTab: "routing" },
      }),
    );
  });

  it("hydrates Mandates without treating its singleton id as a mandate key", () => {
    expect(hydrate("mandate", "mandate-window")).toHaveBeenCalledWith(
      openOverlay({ overlayId: "mandateWindow", data: null }),
    );
    expect(hydrate("mandate", "education.fast-fire")).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "mandateWindow",
        data: { initialMandateKey: "education.fast-fire" },
      }),
    );
  });

  const structuredListCases: ReadonlyArray<readonly [string, OverlayId]> = [
    ["structuredListManagerV1", "structuredListManagerV1Window"],
    ["structuredListManagerV2", "structuredListManagerV2Window"],
  ];

  it.each(structuredListCases)(
    "hydrates %s without treating default as a list id",
    (typeKey, overlayId) => {
      expect(hydrate(typeKey, "default")).toHaveBeenCalledWith(
        openOverlay({ overlayId, data: null }),
      );
      expect(hydrate(typeKey, "list-123")).toHaveBeenCalledWith(
        openOverlay({ overlayId, data: { forcedListId: "list-123" } }),
      );
    },
  );
});
