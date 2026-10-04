import { readUnassignedMandate } from "../read-unassigned";

describe("readUnassignedMandate", () => {
  it("reads the key from a callApi error's server detail", () => {
    const error = {
      status: 503,
      message: "Service unavailable",
      serverDetail: {
        error: "meet_error",
        user_message: "Nobody is assigned to write agenda drafts yet.",
        mandate_key: "meet.agenda_draft",
        remedy_action: "assign_holder",
      },
    };
    expect(readUnassignedMandate(error)).toBe("meet.agenda_draft");
  });

  it("reads a FastAPI {detail: …} body", () => {
    expect(
      readUnassignedMandate({
        detail: { mandate_key: "meet.pre_meeting_brief", remedy_action: "assign_holder" },
      }),
    ).toBe("meet.pre_meeting_brief");
  });

  it("is null for any other refusal", () => {
    expect(readUnassignedMandate({ serverDetail: { error: "meet_error", message: "Not a member." } })).toBeNull();
    expect(readUnassignedMandate({ mandate_key: "meet.agenda_draft" })).toBeNull();
    expect(readUnassignedMandate("boom")).toBeNull();
    expect(readUnassignedMandate(null)).toBeNull();
  });
});
