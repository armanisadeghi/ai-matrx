import {
  isUserSettingsPath,
  USER_SETTINGS_PATH_PATTERN,
} from "./settings-route-path";

describe("user settings route family", () => {
  it("uses one exact family boundary for shell consumers", () => {
    expect(USER_SETTINGS_PATH_PATTERN.test("/user-settings")).toBe(true);
    expect(isUserSettingsPath("/user-settings/appearance")).toBe(true);
    expect(isUserSettingsPath("/user-settingsxyz")).toBe(false);
  });
});
