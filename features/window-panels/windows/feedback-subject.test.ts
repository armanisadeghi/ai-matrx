import { describeSubject, subjectMetadata } from "./feedback-subject";

describe("billing feedback subject", () => {
  const subject = {
    kind: "billing_subscription" as const,
    billingScope: "personal" as const,
    subscriptionId: "sub_harbor_monthly",
    planKey: "personal-entry",
    subscriptionStatus: "past_due",
    invoiceId: "in_harbor_due",
    invoiceStatus: "open",
  };

  it("files Stripe-mirrored support context without a financial instruction", () => {
    expect(describeSubject(subject)).toBe(
      "Billing support request\nAccount: personal\nSubscription: sub_harbor_monthly\nPlan: personal-entry\nSubscription status: past_due\nInvoice: in_harbor_due (open)",
    );
    expect(subjectMetadata(subject)).toEqual({
      kind: "billing_subscription",
      billing_scope: "personal",
      subscription_id: "sub_harbor_monthly",
      plan_key: "personal-entry",
      subscription_status: "past_due",
      invoice_id: "in_harbor_due",
      invoice_status: "open",
    });
  });
});
