import { isGovernedActionDenial } from "@/features/access-gate/lib/governedActionError";

describe("isGovernedActionDenial", () => {
  it("recognizes the governed delete trigger through a wrapped cause", () => {
    const cause = {
      code: "42501",
      message: "Edit access does not include deleting this web_site.",
      details:
        "Deleting someone else's work needs full access, or the person who created it.",
    };
    expect(
      isGovernedActionDenial(
        new Error("Could not delete this site", { cause }),
      ),
    ).toBe(true);
  });

  it("does not turn an infrastructure grant failure into an owner request", () => {
    expect(
      isGovernedActionDenial({
        code: "42501",
        message: "permission denied for schema web",
      }),
    ).toBe(false);
  });

  it("requires SQLSTATE 42501 even when prose resembles a denial", () => {
    expect(
      isGovernedActionDenial({
        code: "PGRST116",
        message: "Edit access does not include deleting this web_site.",
      }),
    ).toBe(false);
  });
});
