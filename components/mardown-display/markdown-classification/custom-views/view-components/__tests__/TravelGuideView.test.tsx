/**
 * TravelGuideView renders model text as React nodes — its old `formatText`
 * built an HTML string from a regex and set it with innerHTML, so markup inside
 * the text (an `<img onerror>`) ran in the page.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Server markup parsed into a detached node: attributes are inspected, nothing runs.
const render = (el: React.ReactElement) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(el);
  return { container };
};

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import TravelGuideView from "../TravelGuideView";

const EVIL = '<img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe>';

describe("TravelGuideView", () => {
  it("renders **bold** / *italic* as elements and markup in the text as literal text", () => {
    const { container } = render(
      <TravelGuideView
        data={{
          hasNestedLists: true,
          sections: [
            { id: "p0", title: "Intro", type: "paragraph", content: `Welcome **to Rome** and *enjoy* ${EVIL}` },
            { id: "h1", title: "Itinerary", type: "heading", depth: 2, content: "Itinerary" },
            {
              id: "l1",
              title: "Itinerary",
              type: "list",
              content: [{ id: "i1", text: `Day **1**: Colosseum ${EVIL}`, subItems: [{ id: "s1", text: `*Tip* ${EVIL}` }] }],
            },
            {
              id: "t1",
              title: "Budget",
              type: "table",
              content: { headers: [`**Item** ${EVIL}`], rows: [[`Hotel *night* ${EVIL}`]] },
            },
          ],
        }}
      />,
    );
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain('<img src="x" onerror="alert(1)">');
    const bold = Array.from(container.querySelectorAll(".font-bold")).map((e) => e.textContent);
    expect(bold).toEqual(expect.arrayContaining(["to Rome"]));
    const italic = Array.from(container.querySelectorAll(".italic")).map((e) => e.textContent);
    expect(italic).toEqual(expect.arrayContaining(["enjoy"]));
  });
});
