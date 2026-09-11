import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Exercise real Markdown parsing and result-field dispatch. Only replace
// Next's client chunk boundary, as in XmlBlock's DOM regression suite.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => jest.requireActual("@/components/markdown-core/MarkdownCoreImpl").default,
}));

import { ResultValue } from "../ResultValue";

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
    const payload = '{"__kind":"artifact","content":"**literal**"}';
    await act(async () => root.render(<ResultValue value={["```json\n" + payload + "\n```"]} density="full" />));
    expect(container.querySelector("pre code")?.textContent).toContain(payload);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("iframe,script")).toBeNull();
  });
});
