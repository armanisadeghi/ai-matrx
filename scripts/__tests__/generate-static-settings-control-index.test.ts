import {
  extractStaticControls,
  settingsControlSearchId,
} from "../generate-static-settings-control-index";
import { staticSettingsControlIndex } from "@/features/settings/static-control-index";

describe("static settings control index", () => {
  it("uses a stable section-and-label anchor identity", () => {
    expect(settingsControlSearchId("Theme", "Color mode")).toBe(
      "settings-control-theme-color-mode",
    );
  });

  it("matches a fresh AST extraction of real registry tab controls", () => {
    const extracted = extractStaticControls();
    expect(extracted).toEqual(staticSettingsControlIndex);
    expect(extracted).toContainEqual(
      expect.objectContaining({
        tabId: "appearance",
        label: "Color mode",
        controlId: "settings-control-theme-color-mode",
      }),
    );
  });

  it("does not invent entries from runtime section titles", () => {
    expect(staticSettingsControlIndex).not.toContainEqual(
      expect.objectContaining({
        tabId: "general.notifications",
        label: "Email",
      }),
    );
  });
});
