import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { displayResolutionOrgId } from "../display-org";

const HOME = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const FILTER = "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee";

describe("displayResolutionOrgId (active org is never an input)", () => {
  it("the page organization filter wins", () => {
    expect(
      displayResolutionOrgId({ pageOrgFilter: FILTER, homeOrganizationId: HOME, memberOrganizationIds: [HOME] }),
    ).toBe(FILTER);
  });
  it("without a filter, the mandate's own home org when the person belongs to it", () => {
    expect(
      displayResolutionOrgId({ pageOrgFilter: null, homeOrganizationId: HOME, memberOrganizationIds: [HOME] }),
    ).toBe(HOME);
  });
  it("a system-homed or foreign-homed mandate resolves in no organization", () => {
    expect(
      displayResolutionOrgId({ pageOrgFilter: null, homeOrganizationId: SYSTEM_ORGANIZATION_ID, memberOrganizationIds: [HOME] }),
    ).toBeNull();
    expect(
      displayResolutionOrgId({ pageOrgFilter: null, homeOrganizationId: HOME, memberOrganizationIds: [] }),
    ).toBeNull();
  });
});
