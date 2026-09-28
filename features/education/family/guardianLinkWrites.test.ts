import type { GuardianLinkView } from "./types";
import { parseGuardianGrants, parseGuardianRequests, parseGuardianResponses, parseGuardianUnlinks } from "./guardianLinkWrites";

const pending: GuardianLinkView = {
  id: "link-1", status: "pending", role: "student", counterpart_user_id: "guardian-1", counterpart_email: "parent@example.com", counterpart_name: "Parent", guardian_user_id: "guardian-1", student_user_id: "student-1", relationship: "guardian", requested_by: "guardian-1", created_at: "2026-09-28T00:00:00Z", reviewed_at: null, verified_at: null, consent_method: null, student_age_band: null,
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
});
