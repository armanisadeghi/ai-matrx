/**
 * A model offered in several classes is named with the class an agent or run
 * uses ("Qwen3.8 27B · Matrx Lightning"); a single-class model never is.
 */

import {
  buildModelClassIndex,
  modelClassName,
  withModelClass,
} from "../model-classes";

const QWEN = "qwen-3-8-27b";
const SOLO = "solo-model";
const FAST_EP = "ep-fast";
const LIGHTNING_EP = "ep-lightning";

const index = buildModelClassIndex([
  // Two offerings inside Matrx Fast collapse to one class (preferred first).
  { model_id: QWEN, offering_id: "fast-a", served_via: "Matrx Fast", served_via_endpoint_id: FAST_EP, priority: 10 },
  { model_id: QWEN, offering_id: "fast-b", served_via: "Matrx Fast", served_via_endpoint_id: FAST_EP, priority: 30 },
  { model_id: QWEN, offering_id: "light", served_via: "Matrx Lightning", served_via_endpoint_id: LIGHTNING_EP, priority: 20 },
  { model_id: SOLO, offering_id: "solo", served_via: "Matrx Fast", served_via_endpoint_id: FAST_EP, priority: 10 },
]);

describe("model class naming", () => {
  it("a pinned class is named", () => {
    expect(modelClassName(index, QWEN, "light")).toBe("Matrx Lightning");
    expect(withModelClass("Qwen3.8 27B", modelClassName(index, QWEN, "light"))).toBe(
      "Qwen3.8 27B · Matrx Lightning",
    );
  });

  it("no pin names the preferred class the server runs", () => {
    expect(modelClassName(index, QWEN, null)).toBe("Matrx Fast");
  });

  it("a collapsed (non-preferred) offering still resolves to its class", () => {
    expect(modelClassName(index, QWEN, "fast-b")).toBe("Matrx Fast");
  });

  it("a pin of ANOTHER model never names this model's class", () => {
    expect(modelClassName(index, QWEN, "solo")).toBe("Matrx Fast");
  });

  it("a single-class model is never decorated", () => {
    expect(modelClassName(index, SOLO, "solo")).toBeUndefined();
    expect(withModelClass("Solo", modelClassName(index, SOLO, null))).toBe("Solo");
  });

  it("nothing loaded = nothing claimed", () => {
    expect(modelClassName(null, QWEN, "light")).toBeUndefined();
  });
});
