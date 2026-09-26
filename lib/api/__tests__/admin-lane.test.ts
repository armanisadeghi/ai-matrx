/**
 * THE ADMIN SEAT on the Python server (lib/api/admin-lane.ts): inside the admin
 * section a server request binds the platform tenant and carries
 * `x-matrx-admin-lane: 1`; on a user page nothing changes, and the header never
 * rides a request bound to any other organization.
 */
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import {
  adminLaneHeadersFor,
  adminLaneOrganizationId,
  withAdminLaneHeader,
} from "@/lib/api/admin-lane";
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

  // Independent security review, 2026-09-26: `adminLaneHeadersFor` is the half the
  // python-client, the transport and the execution system use. It had no guard.
  it("the transport half marks only a platform-tenant request inside the admin section", () => {
    onPage("/administration/intelligence/mandates/x");
    expect(adminLaneHeadersFor(SYSTEM_ORGANIZATION_ID)).toEqual({ "x-matrx-admin-lane": "1" });
    expect(adminLaneHeadersFor(OTHER_ORG)).toEqual({});
    expect(adminLaneHeadersFor(null)).toEqual({});
  });

  it("the transport half never marks a request from a user page", () => {
    onPage("/notes");
    expect(adminLaneHeadersFor(SYSTEM_ORGANIZATION_ID)).toEqual({});
  });

  it("an ORGANIZATION's own admin pages are user pages: no platform tenant, no header", () => {
    onPage(`/organizations/${OTHER_ORG}/admin/members`);
    expect(adminLaneOrganizationId()).toBeNull();
    expect(adminLaneHeadersFor(SYSTEM_ORGANIZATION_ID)).toEqual({});
    expect(applyOrganizationContextHeader({}, SYSTEM_ORGANIZATION_ID)).not.toHaveProperty(
      "x-matrx-admin-lane",
    );
  });

  it("a user path that merely starts like an admin prefix is a user page", () => {
    onPage("/administrationx/anything");
    expect(adminLaneOrganizationId()).toBeNull();
    expect(adminLaneHeadersFor(SYSTEM_ORGANIZATION_ID)).toEqual({});
  });
});
