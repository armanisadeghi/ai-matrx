import "@/__tests__/helpers/register-chat-host";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Exercise real Markdown parsing and result-field dispatch. Only replace
// Next's client chunk boundary, as in XmlBlock's DOM regression suite.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl").default,
}));

import { ResultValue } from "@ai-matrx/chat/tool-call-visualization/result-fields/ResultValue";
import { looksLikeMarkdown } from "@ai-matrx/chat/tool-call-visualization/result-fields/shape";

describe("ResultValue nested Markdown", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    ["*emphasis*.", "em", "emphasis"],
    ["_emphasis_", "em", "emphasis"],
    ["__bold__", "strong", "bold"],
    ["~~removed~~", "del", "removed"],
    ["~~~text\nliteral\n~~~", "pre code", "literal"],
  ])("recognizes %s through the same scalar and list detector", async (value, selector, expected) => {
    await act(async () => root.render(<>
      <ResultValue value={value} density="full" />
      <ResultValue value={[value]} density="full" />
    </>));
    const nodes = [...container.querySelectorAll(selector)];
    expect(nodes).toHaveLength(2);
    expect(nodes.every(node => node.textContent?.trim() === expected)).toBe(true);
  });

  it("keeps ordinary identifiers and spaced multiplication on the plain path", () => {
    for (const value of ["snake_case_name", "price_per_unit", "2 * 3 * 4", "plain text"]) {
      expect(looksLikeMarkdown(value)).toBe(false);
    }
  });

  it.each(["inline", "full"] as const)("formats scalar, list and object prose in %s density", async (density) => {
    await act(async () => root.render(<>
      <ResultValue value="**bold**" density={density} />
      <ResultValue value={["**bold**"]} density={density} />
      <ResultValue value={{ notes: ["**bold**"] }} density={density} />
    </>));
    expect([...container.querySelectorAll("strong")].map(node => node.textContent)).toEqual(["bold", "bold", "bold"]);
  });

  it("formats long table prose and short Markdown lists after their disclosure", async () => {
    const long = "**bold** " + "explanation ".repeat(10);
    await act(async () => root.render(<ResultValue value={[{ description: long, notes: ["**nested**"] }]} density="full" />));
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    const expand = container.querySelector<HTMLButtonElement>('button[title="Expand"]');
    expect(expand).not.toBeNull();
    await act(async () => expand?.click());
    expect([...container.querySelectorAll("strong")].map(node => node.textContent)).toEqual(["bold", "nested"]);
  });

  it("keeps scalar values and list expansion while formatting newly revealed items", async () => {
    await act(async () => root.render(<ResultValue value={[0, false, null, "**revealed**"]} />));
    expect(container.textContent).toContain("0");
    expect(container.textContent).toContain("false");
    expect(container.textContent).toContain("null");
    expect(container.querySelector("strong")).toBeNull();
    const more = [...container.querySelectorAll("button")].find(button => button.textContent === "+1 more");
    expect(more).toBeDefined();
    await act(async () => more?.click());
    expect(container.querySelector("strong")?.textContent).toBe("revealed");
  });

  it("keeps artifact-shaped fenced code inert inside a Markdown list value", async () => {
    // A kind fence is never drawn raw (Arman, 2026-09-30): the markdown leaf
    // hands it to the canonical pipeline — and nothing in it executes.
    const payload = '{"__kind":"artifact","content":"**literal**"}';
    await act(async () => root.render(<ResultValue value={["```json\n" + payload + "\n```"]} density="full" />));
    expect(container.textContent).not.toContain('"__kind"');
    // The canonical pipeline renders the artifact (its content is Markdown, so "literal" may be
    // formatted); what must never happen is the raw fence or anything executable.
    expect(container.textContent).toContain("literal");
    expect(container.textContent).not.toContain("**literal**");
    expect(container.querySelector("iframe,script")).toBeNull();
  });
});
