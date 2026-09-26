/**
 * The dual display's preview renders the editor's MARKDOWN through the
 * allow-list converter — it used to set the raw string as HTML, so a typed
 * `<img onerror>` or `<iframe>` ran in the page.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Server markup parsed into a detached node: attributes are inspected, nothing runs.
const render = (el: React.ReactElement) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(el);
  return { container };
};

jest.mock("@remirror/react", () => ({
  Remirror: () => null,
  EditorComponent: () => null,
  useCommands: () => ({ focus: () => undefined }),
  useRemirror: () => ({ manager: {}, state: {}, onChange: () => undefined }),
}));
jest.mock("remirror/extensions", () => ({ MarkdownExtension: class {} }));
jest.mock("@/styles/themes/useThemeMode", () => ({ useThemeMode: () => ({ mode: "light" }) }));

import { Preview } from "../MarkdownDualDisplay";

describe("MarkdownDualDisplay Preview", () => {
  it("renders markdown as sanitized HTML, never raw", () => {
    const { container } = render(
      <Preview
        markdown={
          '# Title\n\n**bold** and [ok](https://example.com)\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n[bad](javascript:alert(2))'
        }
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });
});
