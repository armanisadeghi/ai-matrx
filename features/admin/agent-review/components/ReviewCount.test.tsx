import { renderToStaticMarkup } from "react-dom/server";
import {
  ReviewCount,
  reviewCountLabel,
} from "@/features/admin/agent-review/components/ReviewCount";

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

  it("keeps explicit accessible count labels honest while loading", () => {
    expect(reviewCountLabel(0, true)).toBe("loading");
    expect(reviewCountLabel(110, false)).toBe("110");
  });
});
