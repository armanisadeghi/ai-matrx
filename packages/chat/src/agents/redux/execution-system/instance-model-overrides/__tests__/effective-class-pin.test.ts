/**
 * Live 2026-10-03: the builder's composer pill named "Qwen3.8 27B · Matrx Fast"
 * for an agent pinned to Matrx Lightning — its instance base was minted empty
 * (or before the agent's settings loaded), so the class fell back to the
 * preferred one while the server ran the agent's pinned class.
 */
import { deriveClassPins } from "../useEffectiveClassPin";

const QWEN = "572667d5-bc84-449c-800e-e89acd36b5f5";
const LIGHTNING = "29874e67-5683-40c2-9adb-fb797ea9a176";
const FAST = "2245f5ca-2dd2-4fed-b34f-7f30aa2c1c6d";

describe("deriveClassPins", () => {
  it("an empty base on the agent's own model runs the agent's class", () => {
    expect(deriveClassPins({ baseSettings: {} }, QWEN, LIGHTNING)).toEqual({
      effectivePin: LIGHTNING,
      basePin: LIGHTNING,
    });
  });

  it("a base minted without the class still names the agent's class", () => {
    expect(
      deriveClassPins({ baseSettings: { model: QWEN } }, QWEN, LIGHTNING).effectivePin,
    ).toBe(LIGHTNING);
  });

  it("an override class wins and differs from the base", () => {
    expect(
      deriveClassPins({ baseSettings: { model: QWEN }, overrides: { offering_id: FAST } }, QWEN, LIGHTNING),
    ).toEqual({ effectivePin: FAST, basePin: LIGHTNING });
  });

  it("another model without a class runs that model's preferred class", () => {
    expect(
      deriveClassPins({ baseSettings: { model: QWEN }, overrides: { model: "other" } }, QWEN, LIGHTNING)
        .effectivePin,
    ).toBeUndefined();
  });

  it("an explicit removal clears the class", () => {
    expect(
      deriveClassPins({ baseSettings: { model: QWEN }, removals: ["offering_id"] }, QWEN, LIGHTNING)
        .effectivePin,
    ).toBeUndefined();
  });
});
