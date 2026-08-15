import { settingDoorHref } from "../settingDoorTarget";

describe("settingDoorHref", () => {
  it("addresses an exact user control", () => {
    expect(
      settingDoorHref({
        scope: "user",
        tabId: "appearance",
        controlId: "appearance.theme-mode",
      }),
    ).toBe(
      "/settings/preferences?tab=appearance&control=appearance.theme-mode",
    );
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
