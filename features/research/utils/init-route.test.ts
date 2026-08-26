import { researchInitHref, researchStartDestination } from "./init-route";

describe("research intake routing", () => {
  it("opens AI intake with the subject, guidance, and safe return path", () => {
    const href = researchInitHref({
      subject: "  Company research for Acme  ",
      instructions: "  Verify acme.example  ",
      returnTo: "/marketing/content-plan/site-1?view=setup",
    });
    const url = new URL(href, "https://aimatrx.local");

    expect(url.pathname).toBe("/research/topics/new");
    expect(url.searchParams.get("mode")).toBe("ai");
    expect(url.searchParams.get("topic")).toBe("Company research for Acme");
    expect(url.searchParams.get("instructions")).toBe("Verify acme.example");
    expect(url.searchParams.get("return_to")).toBe(
      "/marketing/content-plan/site-1?view=setup",
    );
  });

  it("returns the approved topic to the originating setup URL", () => {
    expect(
      researchStartDestination(
        "/marketing/content-plan/site-1?view=setup#grounding",
        "topic-1",
      ),
    ).toBe(
      "/marketing/content-plan/site-1?view=setup&researchTopic=topic-1#grounding",
    );
  });

  it("refuses an off-site return destination", () => {
    expect(
      researchStartDestination("//malicious.example/path", "topic-1"),
    ).toBe("/research/topics/topic-1");
  });
});
