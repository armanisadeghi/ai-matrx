/**
 * COLD WALK 18, DEFECT 2 — "the Masterworks list tells her a Rulebook came
 * from 'Nothing yet' when it came from her own interview."
 *
 * On production `/masterwork/all`, SIX rows printed **"Nothing yet"** under
 * SOURCE while the Rulebook behind each held a recorded interview and a pasted
 * document — one of them listed with eighteen rules. On the walker's own
 * Rulebook the column printed a different falsehood: she added two pasted
 * documents, its Sources panel went to **5**, and the cell stayed
 * **"1 interview · 3 documents"**.
 *
 * ## The row shapes below are LIVE, read 2026-09-21 through `db/adhoc_sql.py`
 *
 * `walk18-Drain and Heater Verdict` (3b12f1fd-526b-45c4-a201-1c47c9063e81):
 *   platform.masterwork_source — 4 rows
 *     interview:e9e9b52a-…  approach `interview`  medium `turns`
 *     file:a8d24322-…       approach `dump`       medium `document`
 *     file:f4a1e5c4-…       approach `dump`       medium `document`
 *     file:ce549863-…       approach `dump`       medium `document`
 *   platform.associations → rulebook — the material half
 *     interview            conversation e9e9b52a-…   (the SAME sitting)
 *     distillation_source  file f4a1e5c4-… / a8d24322-… / ce549863-…
 *                                                    (the SAME three uploads)
 *     distillation_source  udt_document b9d9eec3-… / ba972822-…
 *                                                    (the two pasted documents,
 *                                                     with no kept row at all)
 *
 * `How I decide which incoming e-waste pallets need a manual sort instead…`
 * (e2fb516f-4708-493a-9650-60e59cd4a029) — one of the "Nothing yet" shapes:
 *   platform.masterwork_source — ZERO rows
 *   platform.associations → rulebook
 *     interview            conversation
 *     distillation_source  note            (the pasted document)
 *
 * A census the same day found 17 live `distillation_source` → `note` edges and
 * 53 `interview` → `conversation` edges on Rulebooks holding no kept rows at
 * all — every one of them a row that read "Nothing yet".
 *
 * PROVEN FAILING BEFORE IT PASSED: with `summarizeSources` given only the kept
 * rows (the pre-fix read), "the interview-and-a-pasted-document Rulebook"
 * renders `Nothing yet` and the walk-18 fixture renders `1 interview ·
 * 3 documents`.
 */
import React from "react";
import { renderToString } from "react-dom/server";

import { DUMP_SOURCE_TOKENS } from "../../sourceLinks";
import { entityTokenNouns, sourceNounsFor } from "../../sourceTally";
import { RULEBOOK_COLUMNS } from "../columns";
import {
  formatSourceSummary,
  summarizeSources,
  type AttachedTallyRow,
  type RulebookSourcesRead,
  type SourceTallyRow,
} from "../sourceSummary";
import type { RulebookListRow } from "../../types";

const WALK18 = "3b12f1fd-526b-45c4-a201-1c47c9063e81";
const PALLETS = "e2fb516f-4708-493a-9650-60e59cd4a029";

const WALK18_KEPT: SourceTallyRow[] = [
  {
    rulebook_id: WALK18,
    source_key: "interview:e9e9b52a-df84-4d07-9ad1-60f4f151a45a",
    approach_key: "interview",
    medium: "turns",
  },
  {
    rulebook_id: WALK18,
    source_key: "file:a8d24322-a438-4426-aec7-80b4d3ceeacd",
    approach_key: "dump",
    medium: "document",
  },
  {
    rulebook_id: WALK18,
    source_key: "file:f4a1e5c4-27bb-481e-9b3e-2b9a53217737",
    approach_key: "dump",
    medium: "document",
  },
  {
    rulebook_id: WALK18,
    source_key: "file:ce549863-0bb5-4ec1-ba78-91c540ac34c3",
    approach_key: "dump",
    medium: "document",
  },
];

const WALK18_ATTACHED: AttachedTallyRow[] = [
  {
    target_id: WALK18,
    role: "interview",
    source_type: "conversation",
    source_id: "e9e9b52a-df84-4d07-9ad1-60f4f151a45a",
  },
  {
    target_id: WALK18,
    role: "distillation_source",
    source_type: "file",
    source_id: "f4a1e5c4-27bb-481e-9b3e-2b9a53217737",
  },
  {
    target_id: WALK18,
    role: "distillation_source",
    source_type: "file",
    source_id: "a8d24322-a438-4426-aec7-80b4d3ceeacd",
  },
  {
    target_id: WALK18,
    role: "distillation_source",
    source_type: "file",
    source_id: "ce549863-0bb5-4ec1-ba78-91c540ac34c3",
  },
  {
    target_id: WALK18,
    role: "distillation_source",
    source_type: "udt_document",
    source_id: "b9d9eec3-7b30-44fe-8864-bb8a47a16dcd",
  },
  {
    target_id: WALK18,
    role: "distillation_source",
    source_type: "udt_document",
    source_id: "ba972822-2600-4002-95ae-2b48ab885495",
  },
  // The `kept_source` edges the same Rulebook carries. They point at the kept
  // ROWS, not at material, and counting them would triple the interview.
  {
    target_id: WALK18,
    role: "kept_source",
    source_type: "masterwork_source",
    source_id: "1989b696-c858-4a16-93ab-eca6f2708723",
  },
];

/** The "Nothing yet" shape: an interview and a pasted note, nothing kept. */
const PALLETS_ATTACHED: AttachedTallyRow[] = [
  {
    target_id: PALLETS,
    role: "interview",
    source_type: "conversation",
    source_id: "c0b0f3a1-1f4e-4f1c-9d55-6a7f0e2b1d33",
  },
  {
    target_id: PALLETS,
    role: "distillation_source",
    source_type: "note",
    source_id: "8f2b1c44-5d0a-4a1e-b2c6-7e9d3f5a8b10",
  },
];

function rulebookRow(
  id: string,
  sources: RulebookSourcesRead,
  author?: string,
): RulebookListRow {
  return {
    id,
    name: "walk18-Drain and Heater Verdict",
    slug: "walk18-drain-and-heater-verdict",
    description: "When a drain line or a water heater is a repair, a point fix or a replacement.",
    source: author ? { author, year: 2019 } : {},
    sources,
    version: 12,
    status: "active",
    visibility: "personal",
    rule_count: 49,
    created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    created_at: "2026-09-21T11:34:06.976Z",
    updated_at: "2026-09-21T12:27:18.978Z",
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

function read(
  id: string,
  kept: SourceTallyRow[],
  attached: AttachedTallyRow[],
): RulebookSourcesRead {
  return summarizeSources([id], kept, { attached }).get(id)!;
}

describe("a Rulebook built from an interview and a pasted document", () => {
  it("is never 'Nothing yet' when nothing was ever kept", () => {
    const sources = read(PALLETS, [], PALLETS_ATTACHED);
    expect(formatSourceSummary(sources)).toBe("1 interview · 1 note");
    expect(renderSourceCell(rulebookRow(PALLETS, sources))).not.toContain(
      "Nothing yet",
    );
  });

  it("is what the pre-fix kept-only read printed instead", () => {
    // The exact call this file replaces: the kept store alone. Zero rows, so
    // the cell falls through to the sentence six Experts were shown.
    const keptOnly = summarizeSources([PALLETS], []).get(PALLETS)!;
    expect(formatSourceSummary(keptOnly)).toBeNull();
    expect(renderSourceCell(rulebookRow(PALLETS, keptOnly))).toBe("Nothing yet");
  });
});

describe("the walk-18 fixture, counted from both stores", () => {
  it("names every kind present, including the two pasted documents", () => {
    const sources = read(WALK18, WALK18_KEPT, WALK18_ATTACHED);
    expect(formatSourceSummary(sources)).toBe("1 interview · 5 documents");
    expect(sources.state === "read" && sources.total).toBe(6);
  });

  it("counts the one sitting once, edge and kept row together", () => {
    const sources = read(WALK18, WALK18_KEPT, WALK18_ATTACHED);
    const interview =
      sources.state === "read"
        ? sources.groups.find((g) => g.key === "interview")
        : undefined;
    expect(interview?.count).toBe(1);
  });

  it("counts each upload once, as the document it turned out to be", () => {
    // Three `file:` edges and three `document` kept rows are three sources,
    // and the kept side names them — "3 documents · 3 files" would be the
    // N4 double-count wearing the walk-18 fix.
    const sources = read(WALK18, WALK18_KEPT, WALK18_ATTACHED);
    const words = formatSourceSummary(sources)!;
    expect(words).not.toContain("file");
    expect(words.match(/documents/g)).toHaveLength(1);
  });

  it("ignores `kept_source` edges, which point at rows and not at material", () => {
    const withEdge = read(WALK18, WALK18_KEPT, WALK18_ATTACHED);
    const withoutEdge = read(
      WALK18,
      WALK18_KEPT,
      WALK18_ATTACHED.filter((e) => e.role !== "kept_source"),
    );
    expect(formatSourceSummary(withEdge)).toBe(formatSourceSummary(withoutEdge));
  });

  it("is what the pre-fix kept-only read got wrong by two", () => {
    const keptOnly = summarizeSources([WALK18], WALK18_KEPT).get(WALK18)!;
    expect(formatSourceSummary(keptOnly)).toBe("1 interview · 3 documents");
  });
});

describe("the three honest states survive", () => {
  it("says 'Nothing yet' only when there is truly nothing", () => {
    const sources = read(WALK18, [], []);
    expect(formatSourceSummary(sources)).toBeNull();
    expect(renderSourceCell(rulebookRow(WALK18, sources))).toBe("Nothing yet");
  });

  it("says a failed read is a failed read, not an empty Rulebook", () => {
    const broken = renderSourceCell(
      rulebookRow(WALK18, { state: "unavailable" }),
    );
    expect(broken).toContain("Couldn't read this");
    expect(broken).not.toContain("Nothing yet");
  });

  it("still shows an imported book's author when that is all it has", () => {
    const sources = read(WALK18, [], []);
    const text = renderSourceCell(rulebookRow(WALK18, sources, "Clifford Stoll"));
    expect(text).toContain("Clifford Stoll");
  });
});

describe("the attached vocabulary is not coined here", () => {
  it("gives every token the Sources panel can attach a word", () => {
    for (const token of DUMP_SOURCE_TOKENS) {
      const words = entityTokenNouns(token);
      expect(words).not.toBeNull();
      expect(words!.one).not.toBe("");
      expect(words!.many).not.toBe(words!.one);
    }
    expect(entityTokenNouns("conversation")).not.toBeNull();
  });

  it("never prints a raw token for an edge kind it does not know", () => {
    expect(sourceNounsFor({ sourceKey: "x", entityToken: "hologram" }).one).toBe(
      "source",
    );
    const sources = read(WALK18, [], [
      {
        target_id: WALK18,
        role: "distillation_source",
        source_type: "hologram",
        source_id: "11111111-1111-1111-1111-111111111111",
      },
    ]);
    expect(formatSourceSummary(sources)).toBe("1 source");
  });
});
