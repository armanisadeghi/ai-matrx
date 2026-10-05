/** @jest-environment jsdom */
/**
 * A KIND IS NEVER DRAWN AS RAW JSON — data-table cells (U5 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * A json/array cell holding a kind printed `{"__kind":"flashcard_set",…}` in
 * the grid. In display mode it now reads as the kind's name — the records
 * grid's own kind chip, which opens the value in `structuredValueWindow`;
 * stored as JSON text it is parsed first; unreadable kind text says so.
 * Kindless JSON stays JSON, and the edit box keeps the JSON text.
 *
 * RED BEFORE GREEN: before the fix UserTableViewer formatted every json cell
 * with JSON.stringify (the source assertion) and kind-cell did not exist.
 */
import React, { act } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { createRoot, type Root } from "react-dom/client";

const opened: unknown[] = [];
jest.mock("@/features/overlays/openers/structuredValueWindow", () => ({
  useOpenStructuredValueWindow: () => (opts: unknown) => {
    opened.push(opts);
    return { instanceId: "w", close: () => undefined };
  },
}));
jest.mock("@/features/matrx-envelope/MatrxEnvelopeBlock", () => ({
  __esModule: true,
  default: () => null,
}));

import { kindCell } from "../utils/kind-cell";
import { KindCellPeek } from "../components/KindCellPeek";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flashcards = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};

describe("kindCell", () => {
  it("recognises a stored kind object", () => {
    expect(kindCell(flashcards)).toEqual({
      state: "kind",
      kind: "flashcard_set",
      value: flashcards,
    });
  });

  it("parses kind JSON stored as text", () => {
    expect(kindCell(JSON.stringify(flashcards))).toMatchObject({
      state: "kind",
      kind: "flashcard_set",
    });
  });

  it("calls unreadable kind text broken", () => {
    expect(kindCell('{"__kind":"flashcard_set","title":"Cel')).toEqual({
      state: "broken",
      kind: "flashcard_set",
    });
  });

  it("leaves kindless JSON alone", () => {
    expect(kindCell({ route: "North loop", stops: 14 })).toBeNull();
    expect(kindCell('{"route":"North loop"}')).toBeNull();
    expect(kindCell([1, 2, 3])).toBeNull();
  });
});

describe("KindCellPeek", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    opened.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the kind's name and opens the value in its window", () => {
    act(() =>
      root.render(
        <KindCellPeek cell={kindCell(flashcards)!} title="Study pack" />,
      ),
    );
    expect(container.innerHTML).not.toContain('"__kind"');
    expect(container.textContent).toContain("Flashcard Set");
    const button = container.querySelector("button");
    act(() => button!.click());
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ value: flashcards });
  });

  it("says an unreadable kind cannot be read", () => {
    act(() =>
      root.render(
        <KindCellPeek
          cell={kindCell('{"__kind":"flashcard_set","ti')!}
          title="Study pack"
        />,
      ),
    );
    expect(container.textContent).toBe("Flashcard Set · unreadable");
  });
});

it("UserTableViewer routes a json/array cell through kindCell before formatting", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "..", "components", "user-generated-table-data", "UserTableViewer.tsx"),
    "utf8",
  );
  expect(source).toMatch(/kindCell\(rawValue\)/);
  expect(source).toMatch(/<KindCellPeek cell=\{kindInCell\}/);
});
