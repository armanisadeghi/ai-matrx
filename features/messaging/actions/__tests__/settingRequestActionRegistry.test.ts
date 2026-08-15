const mockAddOrgModuleCustomValue = jest.fn(async () => ["Regional peer"]);

jest.mock("@/features/organizations/orgModuleSettings", () => ({
  addOrgModuleCustomValue: mockAddOrgModuleCustomValue,
}));

import {
  getSettingRequestAction,
  ORG_MODULE_CUSTOM_VALUE_ADD_ACTION,
} from "../settingRequestActionRegistry";

const payload = {
  organization_id: "org-1",
  module_key: "seo_competitor",
  namespace: "competitor_labels",
  value: "Regional peer",
};

describe("setting request action registry", () => {
  beforeEach(() => mockAddOrgModuleCustomValue.mockClear());

  it("executes the canonical organization-value service", async () => {
    const action = getSettingRequestAction(ORG_MODULE_CUSTOM_VALUE_ADD_ACTION);
    expect(action).not.toBeNull();

    await action?.execute(payload, { organizationId: "org-1" });

    expect(mockAddOrgModuleCustomValue).toHaveBeenCalledWith(
      "org-1",
      "seo_competitor",
      "competitor_labels",
      "Regional peer",
    );
  });

  it("refuses a payload that targets a different organization", async () => {
    const action = getSettingRequestAction(ORG_MODULE_CUSTOM_VALUE_ADD_ACTION);

    await expect(
      action?.execute(payload, { organizationId: "org-2" }),
    ).rejects.toThrow("does not match its organization");
    expect(mockAddOrgModuleCustomValue).not.toHaveBeenCalled();
  });
});
