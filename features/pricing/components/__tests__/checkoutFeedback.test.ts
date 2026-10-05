import {
  checkoutReturnContext,
  checkoutReturnKind,
  parseCheckoutStatus,
  checkoutReturnUrls,
  isVerifiedCheckoutSession,
} from "../checkoutReturn";

describe("checkout return feedback", () => {
  it("does not let a success URL claim activation", () => {
    expect(checkoutReturnKind(new URLSearchParams("checkout=success"))).toBe(
      "success",
    );
    expect(parseCheckoutStatus({ status: "active" })).toEqual({
      status: "active",
    });
    expect(parseCheckoutStatus({ status: "success" })).toBeNull();
  });

  it("requires Stripe's exact Checkout session on a success return", () => {
    expect(
      checkoutReturnContext(
        new URLSearchParams(
          "checkout=success&session_id=cs_test_HarborDentalRenewal&plan=personal-entry&cycle=monthly&audience=personal",
        ),
      ),
    ).toEqual({
      kind: "success",
      sessionId: "cs_test_HarborDentalRenewal",
      planKey: "personal-entry",
      cycle: "monthly",
      audience: "personal",
    });
    expect(
      checkoutReturnContext(
        new URLSearchParams("checkout=success&plan=personal-entry"),
      ),
    ).toBeNull();
  });

  it("binds the generated return URL to the exact paid Checkout session", () => {
    const urls = checkoutReturnUrls("https://pricing.matrx.test", {
      planKey: "personal-entry",
      cycle: "monthly",
      audience: "personal",
    });
    const returned = checkoutReturnContext(
      new URLSearchParams(
        urls.success
          .replace("{CHECKOUT_SESSION_ID}", "cs_test_HarborDentalRenewal")
          .split("?")[1],
      ),
    );
    expect(returned?.sessionId).toBe("cs_test_HarborDentalRenewal");
    expect(
      isVerifiedCheckoutSession("cs_test_HarborDentalRenewal", "member-47", {
        id: "cs_test_HarborDentalRenewal",
        mode: "subscription",
        status: "complete",
        clientReferenceId: "member-47",
        purpose: "platform_subscription",
        planKey: "personal-entry",
        cycle: "monthly",
        paymentStatus: "paid",
        hasSubscription: true,
      }),
    ).toBe(true);
    expect(
      isVerifiedCheckoutSession("cs_test_HarborDentalRenewal", "member-47", {
        id: "cs_test_APreviousPayment",
        mode: "subscription",
        status: "complete",
        clientReferenceId: "member-47",
        purpose: "platform_subscription",
        planKey: "personal-entry",
        cycle: "monthly",
        paymentStatus: "paid",
        hasSubscription: true,
      }),
    ).toBe(false);
  });

  it("keeps a canceled return distinct from an unknown URL", () => {
    expect(checkoutReturnKind(new URLSearchParams("checkout=cancelled"))).toBe(
      "cancelled",
    );
    expect(
      checkoutReturnKind(new URLSearchParams("checkout=successfully")),
    ).toBeNull();
  });
});
