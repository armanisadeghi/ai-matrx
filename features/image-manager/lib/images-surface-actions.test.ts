import {
  createExclusiveOperationGate,
  parseVisibleImageSelection,
} from "./images-surface-actions";

const visible = [
  { id: "image-a", fileName: "alpha.png" },
  { id: "image-b", fileName: "beta.png" },
];

describe("Images surface action guards", () => {
  it("normalizes a complete visible selection without changing order", () => {
    expect(
      parseVisibleImageSelection(
        '[" image-b ", "image-a", "image-b"]',
        visible,
      ),
    ).toEqual(["image-b", "image-a"]);
  });

  it("rejects the whole selection when a post-confirmation id is no longer visible", () => {
    expect(() =>
      parseVisibleImageSelection(["image-a", "now-filtered-out"], visible),
    ).toThrow(/selection was left unchanged/i);
  });

  it("allows only one image resolution until the active operation finishes", () => {
    const gate = createExclusiveOperationGate();

    expect(gate.tryStart("image-a")).toBe(true);
    expect(gate.tryStart("image-b")).toBe(false);
    expect(gate.activeId).toBe("image-a");

    gate.finish("image-b");
    expect(gate.activeId).toBe("image-a");

    gate.finish("image-a");
    expect(gate.tryStart("image-b")).toBe(true);
  });
});
