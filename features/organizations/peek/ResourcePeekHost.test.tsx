import type { ComponentType } from "react";

let capturedLoader: (() => Promise<unknown>) | undefined;

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    capturedLoader = loader;
    return () => null;
  },
}));

describe("ResourcePeekHost", () => {
  it("loads the peek host as a renderable component", async () => {
    await import("./ResourcePeekHost");

    expect(capturedLoader).toBeDefined();
    const loaded = await capturedLoader!();

    // next/dynamic receives the component itself. A module-shaped value is
    // silently discarded by the production lazy boundary, leaving every
    // EntityRef Quick look control visibly clickable but inert.
    expect(typeof (loaded as ComponentType)).toBe("function");
  });
});
