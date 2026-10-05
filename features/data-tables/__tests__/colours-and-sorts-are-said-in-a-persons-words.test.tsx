/**
 * COLOURS AND SORTS ARE SAID IN A PERSON'S WORDS (BREAKER-2 B2-28, still reproducible in BREAKER-3).
 *
 * The choice option editor listed its colours by their palette keys ("neutral", "slate", "violet"),
 * and the column header's right-click menu said "Sort A→Z" / "Sort Z→A" on every column — on a
 * Copay column and a Referral Date column too, where "A to Z" means nothing. A person reads the
 * colour's name ("Gray", "Blue"; the palette's own `STYLE_COLOR_LABELS`, the words the highlight
 * menu already uses) and sort words that fit the column: A to Z for words, smallest / largest first
 * for numbers, oldest / newest first for dates. ONE helper (`sort-words.ts`) says them for the
 * right-click menu and the header's own menu.
 *
 * Choice columns keep "A to Z": the Sheet sorts a choice column by its words, not by the order of
 * its options, so "first to last choice" would describe a sort that does not happen.
 *
 * THE REAL USE CASE: Cedar Ridge Physical Therapy's referral log — a Status choice column coloured
 * by the front desk, a Copay money column and a Referral Date column, each sorted from its header.
 *
 * RED PROOF — run 2026-09-29 against the pre-fix editor and menu builder: all four clauses fail
 * ("neutral" on screen, "Sort A→Z" on the date column, no helper).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/features/user-lists/service", () => ({ getAccessibleLists: async () => [] }));
jest.mock("@/features/user-lists/hooks/useStructuredListForSelection", () => ({
  useStructuredListForSelection: () => ({ groups: [], items: [], loading: false, error: null, unavailable: false }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/context-menu-v3/utils/availability", () => ({
  needs: (what: string) => `Needs ${what}`,
  withAvailability: (section: { items: unknown[] }) => section,
}));

import { ChoiceOptionsEditor } from "@/lib/field-formats/ChoiceOptionsEditor";
import { buildGridColumnMenuSection } from "@/features/data-tables/grid-context-menu";
import type { FieldFormatOptions } from "@ai-matrx/design-system/field-formats";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const noop = () => undefined;
function sortLabels(column: Record<string, unknown>) {
  const built = buildGridColumnMenuSection({
    column: { fieldName: "x", displayName: "X", sortedBy: null, canColorBy: false, isColorBy: false, ...column } as never,
    readOnly: false,
    isOnlyColumn: false,
    on: {
      rename: noop, sortAsc: noop, sortDesc: noop, clearSort: noop, hide: noop, configure: noop, remove: noop,
      insert: noop, highlight: noop, colorBy: noop, useAsRowLabel: noop, filter: noop,
    },
  });
  const items = built.items as Array<{ id: string; label: string }>;
  return [items.find((i) => i.id === "grid-col-sort-asc")!.label, items.find((i) => i.id === "grid-col-sort-desc")!.label];
}

describe("colours and sorts in a person's words", () => {
  it("1. the option editor names each colour the way a person does", () => {
    const options: FieldFormatOptions = {
      choices: [
        { value: "New", color: "neutral" },
        { value: "Scheduled", color: "slate" },
        { value: "Discharged", color: "violet" },
      ] as never,
    };
    act(() => root.render(<ChoiceOptionsEditor options={options} onChange={noop} />));
    const shown = [...host.querySelectorAll('[aria-label="Option color"]')].map((el) => (el.textContent ?? "").trim());
    expect(shown).toEqual(["Plain", "Gray", "Violet"]);
    expect(host.textContent).not.toMatch(/\bneutral\b|\bslate\b/);
  });

  it("2. the right-click menu sorts words A to Z, never with an arrow", () => {
    expect(sortLabels({ dataType: "string" })).toEqual(["Sort A to Z", "Sort Z to A"]);
    expect(sortLabels({}).join(" ")).not.toContain("→");
  });

  it("3. numbers sort smallest or largest first, dates oldest or newest first", () => {
    expect(sortLabels({ dataType: "number", formatId: "currency" })).toEqual(["Sort smallest first", "Sort largest first"]);
    expect(sortLabels({ dataType: "date" })).toEqual(["Sort oldest first", "Sort newest first"]);
    expect(sortLabels({ dataType: "datetime" })).toEqual(["Sort oldest first", "Sort newest first"]);
  });

  it("4. one helper says the words for every menu", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sortWordsFor } = require("@/features/data-tables/sort-words") as {
      sortWordsFor: (c: { dataType?: string | null; formatId?: string | null }) => { asc: string; desc: string };
    };
    expect(sortWordsFor({ dataType: "integer", formatId: "rating" })).toEqual({ asc: "smallest first", desc: "largest first" });
    expect(sortWordsFor({ dataType: "string", formatId: "choice" })).toEqual({ asc: "A to Z", desc: "Z to A" });
    expect(sortWordsFor({ dataType: "boolean" })).toEqual({ asc: "unticked first", desc: "ticked first" });
    expect(sortWordsFor({ dataType: "string", formatId: "time" })).toEqual({ asc: "earliest first", desc: "latest first" });
  });
});
