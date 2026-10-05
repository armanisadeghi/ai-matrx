import { isPersonalPlatformSubscription, readClosureJournal, recoveryToken, recoveryTokenMatches } from "./accountClosure";

describe("account closure recovery token", () => {
  it("accepts only the generated token and preserves a valid journal shape", () => {
    const token = recoveryToken();
    expect(recoveryTokenMatches(token.token, token.hash)).toBe(true);
    expect(recoveryTokenMatches(`${token.token}x`, token.hash)).toBe(false);
    expect(recoveryTokenMatches(token.token, undefined)).toBe(false);
    expect(readClosureJournal({ account_closure: {
      requestId: "request", state: "closed", requestedAt: "2026-10-05T00:00:00.000Z", email: "person@example.com",
      checkpoints: { billing_stopped: "2026-10-05T00:00:00.000Z", ignored: 2 }, receipts: { test: ["sub_1", 3] }, errors: ["first", 2],
    } })).toEqual(expect.objectContaining({ checkpoints: { billing_stopped: "2026-10-05T00:00:00.000Z" }, receipts: { test: ["sub_1"] }, errors: ["first"] }));
  });

  it("rejects malformed journals instead of interpreting metadata as closure state", () => {
    expect(readClosureJournal({ account_closure: { state: "closed" } })).toBeNull();
    expect(readClosureJournal({ account_closure: "closed" })).toBeNull();
  });
});

describe("account closure billing selection", () => {
  const subscription = (beneficiary: string, purpose = "platform_subscription") => ({
    metadata: { beneficiary_user_id: beneficiary },
    items: { data: [{ price: { metadata: { purpose } } }] },
  });

  it("never treats a company beneficiary sharing a customer as personal billing", () => {
    expect(isPersonalPlatformSubscription(subscription("company-user") as never, "person-user")).toBe(false);
    expect(isPersonalPlatformSubscription(subscription("person-user", "company_subscription") as never, "person-user")).toBe(false);
    expect(isPersonalPlatformSubscription(subscription("person-user") as never, "person-user")).toBe(true);
  });
});
