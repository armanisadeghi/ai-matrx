import { checkoutReturnKind, parseCheckoutStatus } from "../checkoutFeedback";

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

  it("keeps a canceled return distinct from an unknown URL", () => {
    expect(checkoutReturnKind(new URLSearchParams("checkout=cancelled"))).toBe(
      "cancelled",
    );
    expect(
      checkoutReturnKind(new URLSearchParams("checkout=successfully")),
    ).toBeNull();
  });
});
