import { renderToStaticMarkup } from "react-dom/server";
import { ReviewCount } from "@/features/admin/agent-review/components/ReviewCount";

describe("ReviewCount", () => {
  it("renders a loading treatment instead of an authoritative zero", () => {
    const markup = renderToStaticMarkup(
      <ReviewCount count={0} loading skeletonClassName="h-7 w-12" />,
    );

    expect(markup).toContain('aria-label="loading"');
    expect(markup).not.toContain(">0<");
  });

  it("renders the resolved count after loading", () => {
    expect(
      renderToStaticMarkup(<ReviewCount count={110} loading={false} />),
    ).toBe("110");
  });
});
