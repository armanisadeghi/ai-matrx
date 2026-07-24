import { shouldInheritActiveScope } from "./upload";

describe("shouldInheritActiveScope", () => {
  it("keeps personal uploads independent of the active app scope by default", () => {
    expect(shouldInheritActiveScope("personal")).toBe(false);
  });

  it("allows a personal upload to explicitly inherit the active app scope", () => {
    expect(shouldInheritActiveScope("personal", true)).toBe(true);
  });

  it.each(["public", "shared"] as const)(
    "inherits the active app scope for %s uploads by default",
    (visibility) => {
      expect(shouldInheritActiveScope(visibility)).toBe(true);
    },
  );

  it("allows a non-personal upload to explicitly opt out of scope inheritance", () => {
    expect(shouldInheritActiveScope("public", false)).toBe(false);
  });
});
