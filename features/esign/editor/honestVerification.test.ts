import { honestVerification, sendBlockers, emptyDraft } from "./model";

describe("honestVerification", () => {
  it("shows an unoffered access code as the email code the server will use", () => {
    const d = emptyDraft();
    const r = { key: "a", role: "signer" as const, order: 1, user_id: null, color_index: 0, verification: "access_code" as const, has_access_code: false, full_name: "Bob", email: "b@x.co" };
    const out = honestVerification({ ...d, recipients: [r] });
    expect(out.recipients[0]?.verification).toBe("email_code");
    expect(sendBlockers({ ...d, recipients: [r] }).join()).not.toMatch(/access code/i);
  });
});
