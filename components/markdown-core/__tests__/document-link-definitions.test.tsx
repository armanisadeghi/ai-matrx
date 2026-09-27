/**
 * A reference-style link resolves against the WHOLE document's definitions, as
 * GFM resolves it, even when the renderer split the document into blocks
 * (verify-RC-B4 round 9, R9-4): the table block of a ChatGPT-style answer shows
 * `[Apple Support][1]` as a link although `[1]: https://…` sits in a later block.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { DocumentNumberingProvider } from "../syntax/elements/DocumentNumbering";
import MarkdownCoreImpl from "../MarkdownCoreImpl";

const DOC = [
  "| Model | Source |",
  "| --- | --- |",
  "| AirPods Pro 2 | ([Apple Support][1]) |",
  "| AirPods 4 | [Newsroom][] |",
  "",
  "See [Apple Support][1] for every model.",
  "",
  "[1]: https://support.apple.com/en-us/111851",
  "[Newsroom]: https://www.apple.com/newsroom/",
].join("\n");
const TABLE_BLOCK = DOC.split("\n\n")[0] as string;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(node: ReactNode): { container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => createRoot(container).render(node));
  return { container };
}

it("a table block split from the definitions still shows its links", () => {
  const { container } = render(
    <DocumentNumberingProvider source={DOC}>
      <MarkdownCoreImpl>{TABLE_BLOCK}</MarkdownCoreImpl>
    </DocumentNumberingProvider>,
  );
  const links = [...container.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
  expect(links).toEqual([
    ["Apple Support", "https://support.apple.com/en-us/111851"],
    ["Newsroom", "https://www.apple.com/newsroom/"],
  ]);
  expect(container.textContent).not.toContain("[1]");
  expect(container.textContent).not.toContain("]:");
});

it("a table CELL (inline-only preset) resolves the link and never prints the definitions", () => {
  const { container } = render(
    <DocumentNumberingProvider source={DOC}>
      <MarkdownCoreImpl preset="chat-cell">{"([Apple Support][1])"}</MarkdownCoreImpl>
    </DocumentNumberingProvider>,
  );
  expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["https://support.apple.com/en-us/111851"]);
  expect(container.textContent).toBe("(Apple Support)");
});

it("a cell with no reference prints no definitions", () => {
  const { container } = render(
    <DocumentNumberingProvider source={DOC}>
      <MarkdownCoreImpl preset="chat-cell">{"Model"}</MarkdownCoreImpl>
    </DocumentNumberingProvider>,
  );
  expect(container.textContent).toBe("Model");
});

it("without a document root nothing is invented", () => {
  const { container } = render(<MarkdownCoreImpl>{TABLE_BLOCK}</MarkdownCoreImpl>);
  expect(container.querySelectorAll("a").length).toBe(0);
});
