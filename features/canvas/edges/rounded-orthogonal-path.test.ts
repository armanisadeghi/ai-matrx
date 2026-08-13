import { roundedOrthogonalPath } from "./rounded-orthogonal-path";

describe("roundedOrthogonalPath", () => {
  it("routes through every lane turn with rounded corners", () => {
    const result = roundedOrthogonalPath([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 0 },
    ]);

    expect(result.path).toBe(
      "M 0 0 L 0 84 Q 0 100 16 100 L 184 100 Q 200 100 200 84 L 200 0",
    );
    expect(result.labelX).toBe(100);
    expect(result.labelY).toBe(100);
  });

  it("drops duplicate waypoints instead of producing invalid divisions", () => {
    const result = roundedOrthogonalPath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);

    expect(result.path).toBe("M 0 0 L 50 0");
    expect(result.path).not.toContain("NaN");
  });
});
