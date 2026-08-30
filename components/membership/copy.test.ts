import {
  buildInvitationListPayload,
  buildMemberListPayload,
  invitationRow,
  memberRow,
  memberSummary,
} from "@/components/membership/copy";
import type { PanelInvitation } from "@/components/membership/InvitationsPanel";
import type { PanelMember } from "@/components/membership/MembersPanel";

const member: PanelMember = {
  id: "membership-1",
  userId: "user-1",
  role: "member",
  joinedAt: "2026-08-30T00:00:00.000Z",
  user: { displayName: "Ada Lovelace", email: "ada@example.com" },
  copyDetails: {
    fields: {
      employee_relationship: "linked",
      employee_id: "employee-1",
      employee_record_href: "/hr/people/employee-1?org=example",
    },
    summary: [
      ["Employee", "Ada Lovelace"],
      ["Employee record", "/hr/people/employee-1?org=example"],
    ],
  },
};

const invitation: PanelInvitation = {
  id: "invitation-1",
  email: "grace@example.com",
  role: "member",
  invitedAt: "2026-08-30T00:00:00.000Z",
  expiresAt: "2030-08-30T00:00:00.000Z",
  token: "bearer-secret",
};

describe("membership copy fidelity", () => {
  it("carries host-rendered member facts through row and list payloads", () => {
    expect(memberRow(member)).toMatchObject({
      employee_relationship: "linked",
      employee_id: "employee-1",
      employee_record_href: "/hr/people/employee-1?org=example",
    });
    expect(memberSummary(member)).toContain("Employee: Ada Lovelace");
    expect(memberSummary(member)).toContain(
      "Employee record: /hr/people/employee-1?org=example",
    );

    const payload = buildMemberListPayload({
      members: [member],
      container: { noun: "organization", id: "org-1", name: "Example" },
    });
    expect(payload.data).toMatchObject({
      members: [{ employee_relationship: "linked" }],
    });
  });

  it("never carries invitation accept tokens into copy or agent payloads", () => {
    expect(invitationRow(invitation)).not.toHaveProperty("token");
    const payload = buildInvitationListPayload({
      invitations: [invitation],
      container: { noun: "organization", id: "org-1", name: "Example" },
    });
    expect(JSON.stringify(payload)).not.toContain("bearer-secret");
    expect(payload.attributes).toMatchObject({ tokens_omitted: true });
  });
});
