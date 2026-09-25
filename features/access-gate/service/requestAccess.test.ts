import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import {
  orgManageHref,
  orgSettingKey,
  requestBody,
  resolveRequestOwner,
  type RequestAccessTarget,
} from "./requestAccess";

const target: RequestAccessTarget = {
  action: "Edit goal",
  resource: { kind: "Mandate", name: "Call summary", type: "mandate", id: "m-1" },
  owner: { organizationId: "org-1", organizationName: "Acme" },
};

describe("requestAccess routing", () => {
  it("routes the system organization to the platform team, never to an org inbox", () => {
    expect(resolveRequestOwner("system")).toEqual({ kind: "system" });
    expect(
      resolveRequestOwner({ organizationId: SYSTEM_ORGANIZATION_ID.toUpperCase() }),
    ).toEqual({ kind: "system" });
  });

  it("routes any other organization to that organization's admins", () => {
    expect(resolveRequestOwner(target.owner)).toEqual({
      kind: "organization",
      organizationId: "org-1",
      organizationName: "Acme",
      organizationSlugOrId: "org-1",
    });
  });

  it("keeps an admin door under the organization's settings and never invents a deeper route", () => {
    const owner = resolveRequestOwner(target.owner);
    if (owner.kind !== "organization") throw new Error("expected org");
    expect(
      orgManageHref({ ...target, manageHref: "/organizations/acme/settings/mandates/x" }, owner),
    ).toBe("/organizations/acme/settings/mandates/x");
    expect(orgManageHref({ ...target, manageHref: "/mandates/x" }, owner)).toBe(
      "/organizations/org-1/settings",
    );
  });

  it("dedupes per resource and action, not per page", () => {
    expect(orgSettingKey(target)).toBe("request:mandate:m-1:edit goal");
  });

  it("carries the note first, then the context", () => {
    const body = requestBody(
      target,
      { pageUrl: "http://x/mandates/a", requesterName: "Test", requesterEmail: "t@t.com" },
      "  please  ",
    );
    expect(body.startsWith("please\n\nWants to: Edit goal")).toBe(true);
    expect(body).toContain("Page: http://x/mandates/a");
    expect(body).toContain("Asked by: Test · t@t.com");
    expect(body).toContain("Record: mandate m-1");
  });
});
