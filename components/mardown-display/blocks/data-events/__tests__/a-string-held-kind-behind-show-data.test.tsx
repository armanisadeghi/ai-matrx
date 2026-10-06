/** @jest-environment jsdom */
/**
 * K1 (kind-never-raw round 7): a tool `result` is typed Any server-side and
 * is often a plain STRING holding kind JSON (block-dispatch hands it straight
 * to the card). `ToggledDataBody` used to return "no kind" for every
 * non-object, so the string fell to the raw JSON printer and the screen read
 * `"{\"__kind\":…}"`. Every value shape — string, string with prose and a
 * fence, object, array, object holding a string — must reach the value door,
 * on every card that opens data through the toggle.
 *
 * Plus a source guard: no local "is this a kind" wrapper may refuse strings
 * before asking `valueCarriesKind`.
 */
import React, { act } from "react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-route="value-door" />,
}));

import { ToggledDataBody } from "../ToggledDataBody";
import FunctionResultBlock from "../FunctionResultBlock";
import WorkflowStepBlock from "../WorkflowStepBlock";
import FetchResultsBlock from "../FetchResultsBlock";
import SearchResultsBlock from "../SearchResultsBlock";
import CategorizationResultBlock from "../CategorizationResultBlock";
import SearchErrorBlock from "../SearchErrorBlock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KIND = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};
const KIND_TEXT = JSON.stringify(KIND);

const SHAPES: Array<[string, unknown]> = [
  ["a string that is kind JSON", KIND_TEXT],
  ["a string of prose with a kind fence", `Here are your cards:\n\n\`\`\`json\n${KIND_TEXT}\n\`\`\``],
  ["a kind object", KIND],
  ["an array holding a kind", [KIND]],
  ["an array holding a kind string", [KIND_TEXT]],
  ["an object holding a kind string", { output: KIND_TEXT }],
];

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

const door = () => container.querySelector('[data-route="value-door"]');
function clickAll() {
  // Open every toggle once, innermost (last) first, so a card that starts
  // expanded is never collapsed by its own header before its row opens.
  const clicked = new Set<Element>();
  for (;;) {
    if (door()) return;
    const next = Array.from(container.querySelectorAll("button")).reverse().find((b) => !clicked.has(b));
    if (!next) return;
    clicked.add(next);
    act(() => next.click());
  }
}
function expectNoRaw() {
  expect(door()).not.toBeNull();
  expect(container.innerHTML).not.toMatch(/\\?"__kind\\?"/);
}

describe("K1: ToggledDataBody reads every value shape", () => {
  it.each(SHAPES)("%s goes through the value door", (_name, value) => {
    act(() => root.render(<ToggledDataBody value={value} className="raw" />));
    expectNoRaw();
    expect(container.querySelector("pre")).toBeNull();
  });

  it.each([
    ["a kindless string", "North loop has 14 stops"],
    ["a kindless object", { route: "North loop", stops: 14 }],
  ])("%s stays the deliberate raw view", (_name, value) => {
    act(() => root.render(<ToggledDataBody value={value} className="raw" />));
    expect(door()).toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain("North loop");
  });
});

describe("K1: every card behind the toggle, every shape", () => {
  it.each(SHAPES)("function result: %s", (_name, value) => {
    act(() => root.render(<FunctionResultBlock functionName="make_cards" success result={value} />));
    clickAll();
    expectNoRaw();
  });

  it.each(SHAPES)("workflow step: %s", (_name, value) => {
    act(() => root.render(<WorkflowStepBlock stepName="Cards" status="complete" data={value as Record<string, unknown>} />));
    clickAll();
    expectNoRaw();
  });

  it.each(SHAPES)("search result item: %s", (_name, value) => {
    act(() =>
      root.render(
        <SearchResultsBlock results={[value as Record<string, unknown>]} metadata={{ query: "cells" }} />,
      ),
    );
    clickAll();
    expectNoRaw();
  });

  it.each(SHAPES)("fetch result item: %s", (_name, value) => {
    act(() =>
      root.render(
        <FetchResultsBlock results={[value as Record<string, unknown>]} metadata={{ query: "cells" }} />,
      ),
    );
    clickAll();
    expectNoRaw();
  });

  it.each(SHAPES)("categorization metadata: %s", (_name, value) => {
    act(() =>
      root.render(
        <CategorizationResultBlock
          promptId="p-1"
          category="Biology"
          metadata={value as Record<string, unknown>}
        />,
      ),
    );
    clickAll();
    expectNoRaw();
  });
});

// K7: the search-error card's detail toggle printed metadata as unmarked raw
// JSON, and its message line printed the error as written. The detail is the
// same "show data" toggle as its sibling cards, not a debug source view, so it
// takes the same door; the message reads a kind (a Python-repr dict a server
// error printed, too) as its one-line form.
describe("K7: the search-error card", () => {
  it.each(SHAPES)("metadata detail: %s", (_name, value) => {
    act(() =>
      root.render(
        <SearchErrorBlock error="Search failed" metadata={{ request: value } as Record<string, unknown>} />,
      ),
    );
    clickAll();
    expectNoRaw();
  });

  it("kindless metadata stays the raw JSON view", () => {
    act(() => root.render(<SearchErrorBlock error="Search failed" metadata={{ query: "cells", status: 429 }} />));
    clickAll();
    expect(door()).toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain("429");
  });

  it("an error message holding a kind reads as its one-line form", () => {
    act(() => root.render(<SearchErrorBlock error={`Could not index: ${KIND_TEXT}`} />));
    expect(container.textContent).not.toMatch(/__kind/);
    expect(container.textContent).toContain("Could not index");
    expect(container.textContent).toContain("Flashcard Set");
  });

  // Round 10 (302f4ceed7, 0072e32abd): a Python repr is detection only — left exactly as written,
  // never converted — while the real JSON beside it still reads as its label.
  it("an error message holding a Python repr keeps it as written; the JSON kind beside it converts", () => {
    const pyRepr = "{'__kind': 'flashcard_set', 'title': 'Cell biology'}";
    act(() => root.render(<SearchErrorBlock error={`Could not index ${pyRepr}: ${KIND_TEXT}`} />));
    expect(container.textContent).toContain(`Could not index ${pyRepr}:`);
    expect(container.textContent).toContain("Flashcard Set");
  });
});

// K8: the collapsed preview line of a search / fetch result printed the
// item's snippet / content field as written — a kind there reads as its
// one-line label, never JSON. The toggle stays CLOSED here.
describe("K8: the collapsed preview line", () => {
  const PREVIEWS: Array<[string, string]> = [
    ["kind JSON", KIND_TEXT],
    ["prose with a kind", `Saved deck: ${KIND_TEXT}`],
  ];
  // Round 10: a Python repr in a preview is left exactly as written (detection only).
  const PY_PREVIEW = "Saved deck: {'__kind': 'flashcard_set', 'title': 'Cell biology'}";
  it.each(PREVIEWS)("search snippet: %s", (_name, text) => {
    act(() => root.render(<SearchResultsBlock results={[{ title: "Deck", snippet: text }]} />));
    expect(door()).toBeNull();
    expect(container.textContent).not.toMatch(/__kind/);
    expect(container.textContent).toContain("Flashcard Set");
  });
  it.each(PREVIEWS)("fetch content: %s", (_name, text) => {
    act(() => root.render(<FetchResultsBlock results={[{ title: "Deck", content: text }]} />));
    expect(door()).toBeNull();
    expect(container.textContent).not.toMatch(/__kind/);
    expect(container.textContent).toContain("Flashcard Set");
  });
  it("a Python repr in a search snippet / fetch content is left as written", () => {
    act(() => root.render(<SearchResultsBlock results={[{ title: "Deck", snippet: PY_PREVIEW }]} />));
    expect(container.textContent).toContain(PY_PREVIEW);
    act(() => root.render(<FetchResultsBlock results={[{ title: "Deck", content: PY_PREVIEW }]} />));
    expect(container.textContent).toContain(PY_PREVIEW);
  });
  it("a kindless preview is unchanged", () => {
    act(() => root.render(<SearchResultsBlock results={[{ title: "Deck", snippet: "Mitochondria make ATP." }]} />));
    expect(container.textContent).toContain("Mitochondria make ATP.");
  });
});

describe("K1 source guard: no kind check that refuses strings first", () => {
  it("no wrapper returns false for non-objects before asking valueCarriesKind", () => {
    const repo = path.resolve(__dirname, "../../../../..");
    const files = execSync(
      String.raw`git grep --untracked -l -e "valueCarriesKind(" -- "*.ts" "*.tsx" ":!**/__tests__/**"`,
      { cwd: repo, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    // `if (… typeof x !== "object") return false;` then `return valueCarriesKind(x)`
    const STRING_REFUSING =
      /typeof (\w+) !== "object"\)\s*return false;\s*return valueCarriesKind\(\1\)/;
    const out = files
      .filter((file) => STRING_REFUSING.test(readFileSync(path.join(repo, file), "utf8")))
      .join("\n");
    expect(out).toBe("");
  });
});
