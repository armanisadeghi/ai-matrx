import { settingDoorHref } from "../settingDoorTarget";

describe("settingDoorHref", () => {
  it("sends the first screen to the settings index, never /user-settings/first-screen", () => {
    expect(
      settingDoorHref({
        scope: "user",
        tabId: "firstScreen",
        controlId: "agents.model_prefs.chat_default_model",
      }),
    ).toBe("/user-settings?control=agents.model_prefs.chat_default_model");
  });

  it("addresses an exact user control", () => {
    expect(
      settingDoorHref({
        scope: "user",
        tabId: "appearance",
        controlId: "appearance.theme-mode",
      }),
    ).toBe("/user-settings/appearance?control=appearance.theme-mode");
  });

  it("addresses an exact organization control and preserves non-sensitive intent", () => {
    expect(
      settingDoorHref({
        scope: "organization",
        organizationSlugOrId: "Acme & Co",
        controlId: "org.competitors.custom-labels",
        requestedValue: " Regional peer ",
      }),
    ).toBe(
      "/organizations/Acme%20%26%20Co/settings?setting_value=Regional+peer#org.competitors.custom-labels",
    );
  });

  it("does not add an empty intent query", () => {
    expect(
      settingDoorHref({
        scope: "organization",
        organizationSlugOrId: "acme",
        controlId: "org.competitors.custom-labels",
        requestedValue: "  ",
      }),
    ).toBe("/organizations/acme/settings#org.competitors.custom-labels");
  });
});
