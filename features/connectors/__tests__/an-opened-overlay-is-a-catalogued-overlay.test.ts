/**
 * AN OPENED OVERLAY IS A CATALOGUED OVERLAY (Bugbot finding 2 on e718a50c).
 *
 * `features/overlays/catalogue.ts` is THE single list of overlay ids: its keys
 * define the `OverlayId` union AND the runtime `isOverlayId` guard the Redux
 * middleware uses. An overlay opened by an id that is not a key type-checks
 * nowhere and is REJECTED at runtime — persistence, session restore and every
 * catalogue-gated path treat it as unknown, which is exactly what happened to
 * the two Google import windows before they were registered.
 *
 * This guards the class, not the instance: every overlay id the window
 * registry declares must be a catalogue key.
 */


import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";
import { ALL_WINDOW_STATIC_METADATA } from "@/features/window-panels/registry/windowRegistryMetadata";

describe("the overlay catalogue is the one id list", () => {
  it("carries both Google import windows", () => {
    expect(OVERLAY_CATALOGUE).toHaveProperty("googleContactsImportWindow");
    expect(OVERLAY_CATALOGUE).toHaveProperty("googleTasksImportWindow");
  });

  it("carries every overlay id the window registry declares", () => {
    const missing = ALL_WINDOW_STATIC_METADATA.map((entry) => entry.overlayId)
      .filter((id): id is string => typeof id === "string")
      .filter((id) => !(id in OVERLAY_CATALOGUE));

    expect(missing).toEqual([]);
  });
});
