import { withOfferingPin } from "../offering-pin";

const FAST = "2245f5ca-2dd2-4fed-b34f-7f30aa2c1c6d";

describe("withOfferingPin", () => {
  it("sets the class beside the other settings", () => {
    expect(withOfferingPin({ temperature: 0.2 }, FAST)).toEqual({
      temperature: 0.2,
      offering_id: FAST,
    });
  });

  it("clearing removes the key — never null or empty", () => {
    const out = withOfferingPin({ temperature: 0.2, offering_id: FAST }, undefined);
    expect(out).toEqual({ temperature: 0.2 });
    expect("offering_id" in out).toBe(false);
  });

  it("does not mutate the input", () => {
    const input = { offering_id: FAST };
    withOfferingPin(input, undefined);
    expect(input).toEqual({ offering_id: FAST });
  });
});
