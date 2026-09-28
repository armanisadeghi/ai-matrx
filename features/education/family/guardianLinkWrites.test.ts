import type { GuardianLinkView } from "./types";
import { familyService } from "./familyService";
import { guardianLinkWriteHandlers, parseGuardianGrants, parseGuardianRequests, parseGuardianResponses, parseGuardianUnlinks } from "./guardianLinkWrites";

jest.mock("./familyService", () => ({
  familyService: {
    requestStudent: jest.fn(),
    grantGuardian: jest.fn(),
    respond: jest.fn(),
    unlink: jest.fn(),
  },
}));

const pending: GuardianLinkView = {
  id: "link-1", status: "pending", role: "student", counterpart_user_id: "guardian-1", counterpart_email: "parent@example.com", counterpart_name: "Parent", guardian_user_id: "guardian-1", student_user_id: "student-1", relationship: "guardian", requested_by: "guardian-1", created_at: "2026-09-28T00:00:00Z", reviewed_at: "", verified_at: "", consent_method: "", student_age_band: "",
};

describe("guardian surface writes", () => {
  it("accepts the same email inputs as the request and grant controls", () => {
    expect(parseGuardianRequests([{ student_email: "student@example.com" }])).toEqual(["student@example.com"]);
    expect(parseGuardianGrants([{ guardian_email: "parent@example.com" }])).toEqual(["parent@example.com"]);
  });

  it("refuses duplicate emails before approval", () => {
    expect(() => parseGuardianRequests([{ student_email: "student@example.com" }, { student_email: "student@example.com" }])).toThrow("same student email");
  });

  it("only allows the learner's live pending requests to be decided", () => {
    expect(parseGuardianResponses([{ id: "link-1", approve: true }], [pending])).toEqual([{ link: pending, approve: true }]);
    expect(() => parseGuardianResponses([{ id: "missing", approve: true }], [pending])).toThrow("pending guardian request");
  });

  it("only unlinks a currently loaded relationship", () => {
    expect(parseGuardianUnlinks(["link-1"], [pending])).toEqual([pending]);
    expect(() => parseGuardianUnlinks(["missing"], [pending])).toThrow("current guardian link");
  });

  it("uses the canonical service with live link identities after approval", async () => {
    jest.mocked(familyService.respond).mockResolvedValue({ data: {} as never, error: null });
    jest.mocked(familyService.unlink).mockResolvedValue({ data: true, error: null });
    const reload = jest.fn();
    const handlers = guardianLinkWriteHandlers([pending], reload);

    await handlers.update_guardian_requests.apply([{ id: pending.id, approve: true }]);
    await handlers.delete_guardian_links.apply([pending.id]);

    expect(familyService.respond).toHaveBeenCalledWith("guardian-1", true);
    expect(familyService.unlink).toHaveBeenCalledWith("guardian-1", "student-1");
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
