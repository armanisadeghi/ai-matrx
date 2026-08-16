import { invocationKeyOf } from "../types";

describe("invocationKeyOf", () => {
  it("maps null, undefined, and the wire's empty-string dispatch_id to the same root key", () => {
    const fromNull = invocationKeyOf("step_1", null, 0);
    const fromUndefined = invocationKeyOf("step_1", undefined, undefined);
    const fromWireDefault = invocationKeyOf("step_1", "", 0);
    expect(fromNull).toBe("step_1::root:0");
    expect(fromUndefined).toBe(fromNull);
    // Regression (Bugbot #147): durable events default dispatch_id to "" while
    // client routing passes null — both are the root invocation.
    expect(fromWireDefault).toBe(fromNull);
  });

  it("keeps real fan-out identities distinct", () => {
    expect(invocationKeyOf("step_1", "d1", 0)).toBe("step_1::d1:0");
    expect(invocationKeyOf("step_1", "d1", 1)).toBe("step_1::d1:1");
    expect(invocationKeyOf("step_1", "d2", 0)).not.toBe(
      invocationKeyOf("step_1", "d1", 0),
    );
  });
});
