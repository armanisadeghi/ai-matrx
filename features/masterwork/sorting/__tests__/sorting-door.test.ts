/**
 * @jest-environment node
 */
/**
 * THE SORTING TABLE's frontend guards.
 *
 * Every case here carries its plant-the-bug recipe: the one edit that makes it
 * fail. A guard nobody can demonstrate failing is not a guard.
 *
 * The closest-pair arithmetic and the negative-space pass are the SERVER's
 * (`aidream/services/distillation/tests/test_sorting_table_lane.py` holds those
 * four). What is held still here is the half the browser owns: the card is a
 * real door, the piles the Expert renames are the words that travel, and a case
 * that cannot be sorted is never drawn.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveApproachLane } from "../../browse/approachLane";
import {
  casesFromRecords,
  casesFromSheet,
  looksLikeHeader,
  parsePastedCases,
  suggestColumn,
  MAX_CASES,
  type SheetData,
} from "../cases";
import { defaultPiles, parseBoundaryQuestions, parseRound } from "../types";

// ── the card is a real door, end to end ────────────────────────────────────

describe("the sorting_table card opens the sorting table", () => {
  it("resolves the registry row's lane key to this lane", () => {
    expect(
      resolveApproachLane({ launchHref: null, intakeQuery: { sort: "1" } }),
    ).toEqual({ kind: "sortingTable" });
  });

  it("has a route file at the path the detail page pushes", () => {
    // THE OTHER HALF OF THE DOOR. `resolveApproachLane` returning a lane and
    // the detail page dispatching it are both meaningless if nothing serves the
    // URL — which is exactly how the `timeline` Approach (census row 3) put an
    // Expert on a bare page.
    //
    // PLANT THE BUG: rename `app/(core)/masterwork/[id]/sort/page.tsx`.
    const page = resolve(
      __dirname,
      "../../../../app/(core)/masterwork/[id]/sort/page.tsx",
    );
    const source = readFileSync(page, "utf8");
    expect(source).toContain("SortingTablePage");
    const detail = readFileSync(
      resolve(__dirname, "../../components/detail/RulebookDetailPage.tsx"),
      "utf8",
    );
    expect(detail).toContain('case "sortingTable":');
    expect(detail).toContain("/sort`");
  });
});

// ── the piles are HER words ────────────────────────────────────────────────

describe("the piles a round opens with", () => {
  it("offers two, three and four — and never a fifth", () => {
    expect(defaultPiles(2).map((p) => p.name)).toEqual(["Yes", "No"]);
    expect(defaultPiles(3).map((p) => p.name)).toEqual([
      "Approve",
      "Reject",
      "Escalate",
    ]);
    expect(defaultPiles(4)).toHaveLength(4);
    // Out of range clamps rather than rendering an empty table, and an
    // ABSENT count (0 / NaN — a knob row that could not be read) falls to the
    // declared default of three rather than to the narrowest possible sort.
    expect(defaultPiles(9)).toHaveLength(4);
    expect(defaultPiles(0)).toHaveLength(3);
    expect(defaultPiles(Number.NaN)).toHaveLength(3);
  });

  it("gives every pile a stable key that is not its name", () => {
    // PLANT THE BUG: key a pile by its name — renaming "Escalate" mid-round
    // would then orphan every case already in it.
    const piles = defaultPiles(3);
    expect(piles.map((p) => p.key)).toEqual(["p1", "p2", "p3"]);
    expect(piles.every((p) => p.key !== p.name)).toBe(true);
  });
});

// ── the four doors produce the same kind of case ───────────────────────────

describe("a pasted list", () => {
  it("is one case per line, with list furniture stripped", () => {
    const cases = parsePastedCases(
      "- Rush order, 4 seals\n\n2. New buyer, no credit\n• Weekend pickup\n   \n",
      "pasted",
    );
    expect(cases.map((c) => c.text)).toEqual([
      "Rush order, 4 seals",
      "New buyer, no credit",
      "Weekend pickup",
    ]);
    expect(cases.every((c) => c.id)).toBe(true);
  });

  it("never sorts the same case twice", () => {
    // The same case in two piles is not a boundary, it is a mistake — and it
    // would be handed to the closest-pair arithmetic as a perfect 1.0 match.
    //
    // PLANT THE BUG: delete the `seen` set from `dedupe` in cases.ts.
    const cases = parsePastedCases("Rush order\nrush  ORDER\nOther");
    expect(cases.map((c) => c.text)).toEqual(["Rush order", "Other"]);
  });

  it("stops at the cap rather than handing over an unsortable pile", () => {
    const many = Array.from({ length: MAX_CASES + 50 }, (_, i) => `Case ${i}`);
    expect(parsePastedCases(many.join("\n"))).toHaveLength(MAX_CASES);
  });
});

describe("a spreadsheet", () => {
  const sheet: SheetData = {
    headers: ["id", "customer", "description"],
    rows: [
      ["id", "customer", "description"],
      ["1", "Acme", "Rush order for four hydraulic seals, regular distributor"],
      ["2", "Beta", "New buyer with no credit history wants two hundred units"],
    ],
    totalRows: 3,
  };

  it("suggests the column that actually holds the case", () => {
    // PLANT THE BUG: return 0 from `suggestColumn` — the round becomes a pile
    // of customer IDs, silently.
    expect(suggestColumn(sheet)).toBe(2);
  });

  it("spots a header row rather than sorting it", () => {
    expect(looksLikeHeader(sheet)).toBe(true);
    expect(
      casesFromSheet(sheet, 2, { skipFirstRow: true }).map((c) => c.text),
    ).toEqual([
      "Rush order for four hydraulic seals, regular distributor",
      "New buyer with no credit history wants two hundred units",
    ]);
  });

  it("points each case back at its own row in her file", () => {
    expect(
      casesFromSheet(sheet, 2, { skipFirstRow: true }).map((c) => c.note),
    ).toEqual(["row 2", "row 3"]);
  });
});

describe("picked records", () => {
  it("become cases named by the record, not by its id", () => {
    expect(
      casesFromRecords([
        { token: "udt_document", id: "abc", title: "Northline quote, September" },
      ]),
    ).toEqual([
      expect.objectContaining({
        text: "Northline quote, September",
        note: "udt document",
      }),
    ]);
  });
});

// ── a dead card is worse than a short round ────────────────────────────────

describe("parsing what the server sent", () => {
  it("drops a case with no text rather than drawing a blank card", () => {
    // PLANT THE BUG: push every entry in `parseRound` regardless of `text`.
    const round = parseRound({
      cases: [
        { id: "c1", text: "A real case", note: "" },
        { id: "c2", text: "   ", note: "" },
        { id: "", text: "orphan", note: "" },
      ],
      requested: 3,
      pile_count: 3,
      boundary_questions: 5,
    });
    expect(round?.cases.map((c) => c.id)).toEqual(["c1"]);
    // …and it reports what it ASKED for, never the count it actually has
    // dressed up as the promise.
    expect(round?.requested).toBe(3);
  });

  it("reads an absent voice knob as ON", () => {
    expect(parseRound({ cases: [] })?.voiceDefaultOn).toBe(true);
    expect(parseRound({ cases: [], voice_default_on: false })?.voiceDefaultOn).toBe(
      false,
    );
  });

  it("refuses a pair question that arrived without its pair", () => {
    // A `pair` question with no cases has nothing to point a rule at, so it is
    // never asked. The empty-pile question beside it — which correctly has no
    // pair — is.
    //
    // PLANT THE BUG: delete the `kind === "pair" && !(left && right)` guard in
    // `parseBoundaryQuestions`.
    const questions = parseBoundaryQuestions({
      questions: [
        { id: "q1", kind: "pair", prompt: "Broken", left_case: "", right_case: "" },
        {
          id: "q2",
          kind: "empty_pile",
          prompt: "Nothing went in Escalate. What would have to be true?",
          empty_pile: "Escalate",
        },
        {
          id: "q3",
          kind: "pair",
          prompt: "What makes this one Approve and that one Reject?",
          left_case: "Forty drives",
          left_pile: "Approve",
          right_case: "Thirty-nine drives",
          right_pile: "Reject",
          closeness: 0.94,
        },
      ],
    });
    expect(questions.map((q) => q.id)).toEqual(["q2", "q3"]);
    expect(questions[0].kind).toBe("empty_pile");
    expect(questions[0].leftCase).toBe("");
    expect(questions[1].closeness).toBeCloseTo(0.94);
  });
});
