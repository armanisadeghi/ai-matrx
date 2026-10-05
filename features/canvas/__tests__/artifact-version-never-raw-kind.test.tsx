/**
 * KIND_NEVER_RAW S5 (round 4): the artifact "Version history" popover printed
 * the selected version through JSON.stringify in a <pre>. A kind version now
 * draws through `AnswerValueView`; raw JSON is behind the labelled "View JSON"
 * toggle; the compare diff reads the readable text; restore keeps the stored data.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import {
  ArtifactVersionBody,
  versionReadableText,
  versionText,
} from "../components/ArtifactVersionBody";

const SET = { __kind: "flashcard_set", title: "Cell biology", cards: [] };
const row = (data: unknown) =>
  ({ id: "r1", version: 2, type: "flashcards", content: { data } }) as never;

let root: Root | null = null;
function mount(el: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

it("a kind version draws through the answer view, no <pre> of JSON", () => {
  const host = mount(<ArtifactVersionBody row={row(SET)} />);
  expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
  expect(host.querySelector("pre")).toBeNull();
  expect(host.textContent).not.toContain("__kind");
});

it("a kind stored as text draws through the answer view too", () => {
  const host = mount(<ArtifactVersionBody row={row(JSON.stringify(SET))} />);
  expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
  expect(host.querySelector("pre")).toBeNull();
});

it("View JSON is the explicit, marked raw view", () => {
  const host = mount(<ArtifactVersionBody row={row(SET)} />);
  const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent === "View JSON");
  expect(toggle).toBeDefined();
  act(() => toggle!.click());
  const pre = host.querySelector("pre");
  expect(pre?.getAttribute("data-kind-source")).toBe("explicit");
  expect(pre?.textContent).toContain("__kind");
});

it("a kindless body keeps its plain view", () => {
  const host = mount(<ArtifactVersionBody row={row("<h1>hi</h1>")} />);
  expect(host.querySelector("pre")?.textContent).toBe("<h1>hi</h1>");
  expect(host.querySelector('[data-testid="answer-value-view"]')).toBeNull();
});

it("the diff text is readable; the stored text (restore) keeps the data", () => {
  expect(versionReadableText(row(SET))).not.toContain("__kind");
  expect(versionReadableText(row(SET))).toContain("Cell biology");
  expect(versionReadableText(row(JSON.stringify(SET)))).not.toContain("__kind");
  expect(versionText(row(SET))).toContain("__kind");
});
