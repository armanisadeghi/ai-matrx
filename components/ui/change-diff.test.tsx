import { renderToStaticMarkup } from "react-dom/server";
import { ChangeDiff } from "./change-diff";

describe("ChangeDiff", () => {
  it("renders long proposed block values without a visual clamp", () => {
    const tail = "THE END OF THE PROPOSED VALUE";
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Proposed value",
            after: `${"A full sentence that must remain reviewable. ".repeat(20)}${tail}`,
            block: true,
          },
        ]}
      />,
    );

    expect(markup).toContain(tail);
    expect(markup).not.toContain("line-clamp");
  });

  it("wraps inline values instead of truncating them", () => {
    const markup = renderToStaticMarkup(
      <ChangeDiff
        fields={[
          {
            label: "Name",
            before: "The complete original value",
            after: "The complete proposed replacement value",
          },
        ]}
      />,
    );

    expect(markup).not.toContain("truncate");
    expect(markup).toContain("The complete proposed replacement value");
  });
});
