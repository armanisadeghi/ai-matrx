/**
 * THE ADMIN SEAT on the Python server (lib/api/admin-lane.ts): inside the admin
 * section a server request binds the platform tenant and carries
 * `x-matrx-admin-lane: 1`; on a user page nothing changes, and the header never
 * rides a request bound to any other organization.
 */
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { adminLaneOrganizationId, withAdminLaneHeader } from "@/lib/api/admin-lane";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";

const OTHER_ORG = "44444444-4444-4444-8444-444444444444";

function onPage(path: string) {
  window.history.pushState({}, "", path);
}

describe("the admin lane", () => {
  it("binds the platform tenant and marks the lane inside the admin section", () => {
    onPage("/administration/intelligence/mandates/x");
    expect(adminLaneOrganizationId()).toBe(SYSTEM_ORGANIZATION_ID);
    expect(applyOrganizationContextHeader({}, SYSTEM_ORGANIZATION_ID)).toMatchObject({
      "x-matrx-admin-lane": "1",
    });
  });

  it("never marks a request bound to another organization, even in admin", () => {
    onPage("/administration/intelligence/mandates/x");
    expect(withAdminLaneHeader({ "X-Organization-Id": OTHER_ORG })).not.toHaveProperty(
      "x-matrx-admin-lane",
    );
  });

  it("changes nothing on a user page", () => {
    onPage("/notes");
    expect(adminLaneOrganizationId()).toBeNull();
    expect(applyOrganizationContextHeader({}, SYSTEM_ORGANIZATION_ID)).not.toHaveProperty(
      "x-matrx-admin-lane",
    );
  });
});
