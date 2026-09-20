import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/overlays/catalogue";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import { initUrlHydration } from "../url-sync/initUrlHydration";
import { getHydrator } from "../url-sync/UrlPanelRegistry";
import { PANEL_KEY_ALIASES } from "../url-sync/panelKeyAliases";

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

  /**
   * V-29 NEW-1. An alias only works if BOTH halves are real: the alias key must
   * open something, and its canonical target must be a key some window actually
   * publishes. A dangling alias sends `UrlPanelManager` to wait on a key nothing
   * will ever register — which is exactly the red-tier false alarm the alias map
   * exists to end.
   */
  it("declares only aliases that are real in both directions", () => {
    const registryKeys = new Set(
      ALL_WINDOW_STATIC_METADATA.map((entry) => entry.urlSync?.key).filter(
        (key): key is string => Boolean(key),
      ),
    );

    const broken = Object.entries(PANEL_KEY_ALIASES).flatMap(
      ([aliasKey, canonicalKey]) => {
        const problems: string[] = [];
        if (!getHydrator(aliasKey)) problems.push("alias has no hydrator");
        if (!registryKeys.has(canonicalKey)) {
          problems.push(`no window publishes urlSync.key "${canonicalKey}"`);
        }
        if (registryKeys.has(aliasKey)) {
          problems.push("a window already publishes the alias key itself");
        }
        return problems.map((problem) => `${aliasKey}: ${problem}`);
      },
    );

    expect(broken).toEqual([]);
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

  it("hydrates a topic panel back onto its own (map, topic) pair", () => {
    // The instance id a real click mints — `topicPanelInstanceId` in
    // features/marketing/seo/topical-map/panel/topicPanelInstance.ts.
    expect(hydrate("topic", "8f1c2d3e-map|local-seo-for-dentists"))
      .toHaveBeenCalledWith(
        openOverlay({
          overlayId: "topicalMapTopicPanel",
          instanceId: "8f1c2d3e-map|local-seo-for-dentists",
          data: {
            stackIndex: 0,
            mapId: "8f1c2d3e-map",
            slug: "local-seo-for-dentists",
            siteId: null,
          },
        }),
      );
  });

  it("opens nothing, loudly, for a topic token with half an identity", () => {
    // OverlayController skips an instance with no map or no slug, so a panel
    // opened from "?panels=topic:8f1c2d3e-map" would be an invisible window in
    // the tray. It must refuse and say so instead.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const dispatch = jest.fn();
    getHydrator("topic")?.(dispatch, "8f1c2d3e-map", {});
    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("?panels=topic:8f1c2d3e-map"),
    );
    warn.mockRestore();
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
