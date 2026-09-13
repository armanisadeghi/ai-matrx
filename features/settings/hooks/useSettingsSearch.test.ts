import {
  dedupeSettingsControlSearchHits,
  type SettingsControlSearchHit,
} from "../search/controlSearch";

const hit = (tabId: string, controlId: string): SettingsControlSearchHit => ({
  id: `static:${controlId}`,
  label: "Color mode",
  location: tabId,
  tabId,
  controlId,
  href: `/user-settings/${tabId}?control=${controlId}`,
});

describe("dedupeSettingsControlSearchHits", () => {
  it("keeps the first canonical route for a repeated control id", () => {
    expect(
      dedupeSettingsControlSearchHits([
        hit("appearance", "theme.color-mode"),
        hit("appearance.theme", "theme.color-mode"),
      ]),
    ).toEqual([hit("appearance", "theme.color-mode")]);
  });
});
