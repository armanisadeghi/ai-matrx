import { RETIRED_TAB_IDS, urlToTabId } from "../routing";
import { settingsRegistry } from "../../registry";

describe("settings addresses", () => {
  it("opens the replacement for a retired tab instead of an empty page", () => {
    expect(urlToTabId(["appearance", "accent"])).toBe("appearance.theme");
    expect(urlToTabId(["appearance", "layout"])).toBe("appearance.theme");
    expect(urlToTabId(["voice", "tts"])).toBe("voice.voices");
  });

  it("leaves a live tab alone", () => {
    expect(urlToTabId(["voice", "voices"])).toBe("voice.voices");
  });

  it("every replacement is a real tab and no retired id is still registered", () => {
    const ids = new Set(settingsRegistry.map((t) => t.id));
    for (const [retired, replacement] of Object.entries(RETIRED_TAB_IDS)) {
      expect(ids.has(replacement)).toBe(true);
      expect(ids.has(retired)).toBe(false);
    }
  });
});
