import { reviewTargetPageDisplay } from "@/features/admin/agent-review/target-page";

describe("reviewTargetPageDisplay", () => {
  it("shows manage destinations as app-relative routes", () => {
    expect(
      reviewTargetPageDisplay(
        "https://manage.aimatrx.com/administration/reporting/public-exposure",
      ),
    ).toEqual({
      href: "https://manage.aimatrx.com/administration/reporting/public-exposure",
      fullHref:
        "https://manage.aimatrx.com/administration/reporting/public-exposure",
      label: "/administration/reporting/public-exposure",
    });
  });

  it("resolves stored relative routes to the canonical admin origin", () => {
    expect(reviewTargetPageDisplay("/marketing/brands/123?view=workbench"))
      .toEqual({
        href: "/marketing/brands/123?view=workbench",
        fullHref:
          "https://manage.aimatrx.com/marketing/brands/123?view=workbench",
        label: "/marketing/brands/123?view=workbench",
      });
  });

  it("keeps the hostname visible for external destinations", () => {
    expect(
      reviewTargetPageDisplay("https://www.mymatrx.com/c/example/press"),
    ).toEqual({
      href: "https://www.mymatrx.com/c/example/press",
      fullHref: "https://www.mymatrx.com/c/example/press",
      label: "www.mymatrx.com/c/example/press",
    });
  });
});
