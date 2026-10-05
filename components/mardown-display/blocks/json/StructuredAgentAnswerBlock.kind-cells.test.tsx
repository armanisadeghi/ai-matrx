/**
 * The structured answer's own table cells and chips never print a kind as raw
 * JSON (kind-never-raw R8-open, 2026-10-05): a cell holding a kind object, a
 * cell holding kind JSON text, and a chip whose text is kind JSON each show the
 * kind's one-line label.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StructuredAgentAnswerBlock } from "./StructuredAgentAnswerBlock";

const value = {
  answer: "Built two sets.",
  sets: [
    { name: "Cells", detail: { __kind: "flashcard_set", title: "Cell Biology", cards: [] } },
    { name: "Bio", detail: '{"__kind":"flashcard_set","title":"Genetics","cards":[]}' },
  ],
  tags: ['{"__kind":"flashcard","front":"Mitochondria","back":"Powerhouse"}', "plain"],
};

function visibleMarkup(): string {
  const html = renderToStaticMarkup(
    <StructuredAgentAnswerBlock
      value={value as never}
      rawContent={JSON.stringify(value)}
      renderMarkdown={(content) => <p>{content}</p>}
    />,
  );
  // The collapsed raw-payload disclosure is its own reviewed surface.
  return html.split("<details")[0];
}

describe("StructuredAgentAnswerBlock — kind cells and chips", () => {
  it("never prints a __kind key in table cells or chips", () => {
    expect(visibleMarkup()).not.toMatch(/__kind/);
  });

  it("names each kind by its label and keeps plain cells as written", () => {
    const html = visibleMarkup();
    expect(html).toContain("Cell Biology");
    expect(html).toContain("Genetics");
    expect(html).toContain("plain");
    expect(html).toContain("Cells");
  });
});
