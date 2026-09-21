/**
 * COLD WALK 16, DEFECT F — "the Masterwork list prints nothing in SOURCE."
 * (Walk 15 recorded it as I, walk 14 as E. Three walks, unchanged.)
 *
 * `/masterwork/all` printed `—` under **SOURCE** on all twelve rows read,
 * including the walk's own Rulebook, built forty minutes earlier from one
 * interview and five real files — two HVAC guides, a service-call CSV,
 * estimator training notes and a PNG field sheet.
 *
 * The cause was not a missing query. The cell rendered `rulebook.source.author`
 * — a bibliographic jsonb field only the book-import lane ever fills — so a
 * column headed SOURCE was answering "who wrote the book this came from", a
 * question almost no Rulebook has. The kept raw material was in
 * `platform.masterwork_source` the whole time and the list had never asked.
 *
 * The rows below are the walk's own Rulebook and a real book import, in the
 * shape `platform.masterwork_source` actually stores (`approach_key` +
 * `medium`, as read live: `interview`/`turns`, `dump`/`document`).
 *
 * Proven failing before it passed (2026-09-21): with the cell back on
 * `row.source.author`, the walk's Rulebook renders `—` and the first three
 * assertions fail.
 */
import React from "react";
import { renderToString } from "react-dom/server";

import { MEDIUM_LABELS } from "../../kept-sources/columns";
import { KEPT_SOURCE_MEDIA } from "../../kept-sources/types";
import { RULEBOOK_COLUMNS } from "../columns";
import {
  formatSourceSummary,
  groupWordsFor,
  summarizeSources,
  type RulebookSourcesRead,
  type SourceTallyRow,
} from "../sourceSummary";
import type { RulebookListRow } from "../../types";

/** walk16-HVAC Repair or Replace Verdict — one interview, five files. */
const HVAC = "4eeba280-c33b-4731-a0e5-9e19cabdb129";
/** A Rulebook imported from a book: `source.author` is all it has. */
const BOOK = "7edd1e29-0659-4804-ad90-7a38cccf3e23";

const WALK16_ROWS: SourceTallyRow[] = [
  { rulebook_id: HVAC, approach_key: "interview", medium: "turns" },
  { rulebook_id: HVAC, approach_key: "dump", medium: "document" },
  { rulebook_id: HVAC, approach_key: "dump", medium: "document" },
  { rulebook_id: HVAC, approach_key: "dump", medium: "document" },
  { rulebook_id: HVAC, approach_key: "dump", medium: "document" },
  { rulebook_id: HVAC, approach_key: "dump", medium: "document" },
];

function rulebookRow(
  id: string,
  sources: RulebookSourcesRead,
  author?: string,
): RulebookListRow {
  return {
    id,
    name: "walk16-HVAC Repair or Replace Verdict",
    slug: "walk16-hvac-repair-or-replace-verdict",
    description: "When a failing system is a repair and when it is a replacement.",
    source: author ? { author, year: 2019 } : {},
    sources,
    version: 15,
    status: "active",
    visibility: "personal",
    rule_count: 51,
    created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    created_at: "2026-09-21T01:50:00.000Z",
    updated_at: "2026-09-21T02:35:00.000Z",
  };
}

const sourceColumn = RULEBOOK_COLUMNS.find((c) => c.label === "Source")!;

function renderSourceCell(row: RulebookListRow): string {
  return renderToString(<>{sourceColumn.column.cell!(row, 0)}</>)
    .replace(/<!--[^>]*-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&apos;/g, "'")
    .trim();
}

describe("SOURCE names what the Rulebook was built from", () => {
  it("reads one interview and five files as a sentence, not a dash", () => {
    const read = summarizeSources([HVAC], WALK16_ROWS).get(HVAC)!;
    expect(formatSourceSummary(read)).toBe("1 interview · 5 documents");
  });

  it("renders that sentence in the cell the walk saw as —", () => {
    const read = summarizeSources([HVAC], WALK16_ROWS).get(HVAC)!;
    const text = renderSourceCell(rulebookRow(HVAC, read));
    expect(text).toContain("1 interview");
    expect(text).toContain("5 documents");
    expect(text).not.toBe("—");
  });

  it("counts an interview as an interview, never as its medium", () => {
    // Its kept row is `medium: "turns"` — a Conversation, which is true and
    // useless on this screen. The Approach that captured it is the authority.
    expect(groupWordsFor({ approach_key: "interview", medium: "turns" }).key).toBe(
      "interview",
    );
    expect(groupWordsFor({ approach_key: "dump", medium: "turns" }).key).toBe(
      "turns",
    );
  });

  it("still shows an imported book's author when that is all it has", () => {
    const read = summarizeSources([BOOK], []).get(BOOK)!;
    expect(formatSourceSummary(read)).toBeNull();
    const text = renderSourceCell(rulebookRow(BOOK, read, "Clifford Stoll"));
    expect(text).toContain("Clifford Stoll");
    expect(text).toContain("2019");
  });

  it("says nothing-yet and could-not-read as DIFFERENT sentences", () => {
    // A failed read is not the same fact as an empty Rulebook, and a column
    // that draws both as a dash is the original defect wearing a hat (law 4).
    const empty = renderSourceCell(
      rulebookRow(BOOK, summarizeSources([BOOK], []).get(BOOK)!),
    );
    const broken = renderSourceCell(rulebookRow(BOOK, { state: "unavailable" }));
    expect(empty).toBe("Nothing yet");
    expect(broken).toContain("Couldn't read this");
    expect(broken).not.toBe(empty);
  });

  it("says a truncated scan is a floor instead of printing a wrong count", () => {
    const read = summarizeSources([HVAC], WALK16_ROWS, { partial: true }).get(
      HVAC,
    )!;
    expect(formatSourceSummary(read)).toBe("6+ sources");
  });
});

describe("the column's vocabulary is not coined here", () => {
  it("gives every medium the reader knows about a sentence word", () => {
    for (const medium of KEPT_SOURCE_MEDIA) {
      const words = groupWordsFor({ approach_key: "dump", medium });
      expect(words.key).toBe(medium);
      expect(words.one).not.toBe("source");
      // THE SAME WORD THE KEPT-SOURCES LIST RENDERS — one vocabulary, not two.
      expect(words.one).toBe(MEDIUM_LABELS[medium].toLowerCase());
      expect(words.many.startsWith(words.one)).toBe(true);
    }
  });

  it("never prints a raw stored word for a medium it does not know", () => {
    // A medium added on the server must arrive as "source", not as
    // `oracle_tap`-shaped prose on an Expert's screen.
    const words = groupWordsFor({ approach_key: "dump", medium: "hologram" });
    expect(words.one).toBe("source");
    const read = summarizeSources(
      [HVAC],
      [{ rulebook_id: HVAC, approach_key: "dump", medium: "hologram" }],
    ).get(HVAC)!;
    expect(formatSourceSummary(read)).toBe("1 source");
  });
});

describe("the SOURCE column no longer reads the bibliographic blob", () => {
  it("is keyed on the sources it renders, and offers no lie of a sort", () => {
    expect(sourceColumn.id).toBe("sources");
    expect(sourceColumn.column.id).toBe("sources");
    // The tally is computed over the loaded page, so ordering or narrowing by
    // it would claim to have done so over the whole set.
    expect(sourceColumn.column.sortable).toBe(false);
    expect(sourceColumn.column.filter).toBe(false);
  });

  it("answers a Rulebook with no kept sources and no author", () => {
    const rows = summarizeSources([HVAC, BOOK], WALK16_ROWS);
    expect(rows.get(BOOK)).toEqual({
      state: "read",
      groups: [],
      total: 0,
      partial: false,
    });
  });
});
