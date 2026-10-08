import { emptyDraft, newRecipient, sendBlockers } from "./model";

describe("sendBlockers — access code (verify A3, sender defect 3)", () => {
  const doc = { key: "d", file_id: "f", name: "Lease.pdf", page_count: 1 };
  it("asks for the code before Send when a recipient uses an access code without one set", () => {
    const r = newRecipient([], { full_name: "Bob", email: "b@example.com", verification: "access_code" });
    expect(sendBlockers({ ...emptyDraft("x"), documents: [doc], recipients: [r] })).toContain("Set an access code for Bob.");
  });
  it("is ready once the code is set, and never asks for an email-code recipient", () => {
    const set = newRecipient([], { full_name: "Bob", email: "b@example.com", verification: "access_code", has_access_code: true });
    const mail = newRecipient([set], { full_name: "Dee", email: "d@example.com", verification: "email_code" });
    expect(sendBlockers({ ...emptyDraft("x"), documents: [doc], recipients: [set, mail] })).toEqual([]);
  });
});
