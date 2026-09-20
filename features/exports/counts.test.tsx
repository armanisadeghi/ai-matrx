/**
 * THE GUARD for defect D6 — "the summary card and the facets disagree while
 * indexing".
 *
 * WHAT BROKE. On a live `/exports/[libraryId]` whose index was still running,
 * the summary card rendered "WITH A FILE —" at the same moment, on the same
 * screen, as the list header rendered "158 of 4,000 items … with an
 * attachment". Both described the same quantity; neither knew the other
 * existed. The card read `ExportSummary`, which the server publishes only on
 * `library.index.completed` (so mid-index every field of it was null and the
 * card showed an em-dash); the header read `filtered_total`/`total` from the
 * last items page, which is live and real. The "Items" stat read a third
 * source (the index stream's cumulative) and the scope tab a fourth (its own
 * extra `limit=1` request).
 *
 * WHY THIS TEST CANNOT GO GREEN ON A LIE (`forcing-function-tests`):
 *   • It renders the REAL `LibrarySummary` and the REAL `ExportListTotals`
 *     through the REAL React DOM renderer, from ONE real `deriveExportCounts`
 *     call — the exact objects and the exact code path the page mounts. There
 *     is no stub of the derivation, the formatter or either component.
 *   • It asserts EQUALITY BETWEEN TWO RENDERED SURFACES, not a value against a
 *     constant. Nobody can satisfy it by adjusting an expected number: the
 *     only way both places show the same number is for both to derive it from
 *     the same object, which is the fix.
 *   • The mid-index state it drives is the real one: no summary published,
 *     the index still running, and one items page read back under the
 *     attachment filter — which is precisely what the screen in the defect
 *     report was in when it contradicted itself.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { deriveExportCounts, type ExportPageFacts } from "./counts";
import { LibrarySummary } from "./components/LibrarySummary";
import { ExportListTotals } from "./components/ExportListTotals";
import type { ExportLibrary, ExportSummary } from "./types";

// ─── Rendering harness ───────────────────────────────────────────────────────

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: React.ReactElement): string {
  act(() => root.render(node));
  return host.textContent ?? "";
}

/** The digits a rendered stat or line is actually showing, in order. */
function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
}

/** The value the summary strip shows under one label, as a person reads it. */
function statValue(text: string, label: string): string {
  const at = text.indexOf(label);
  if (at === -1) throw new Error(`the card never rendered a "${label}" stat`);
  const after = text.slice(at + label.length);
  // Each stat is `<label><value>`, and the next stat's label starts with a
  // capital letter or the strip ends.
  const match = after.match(/^(—|counting…|[\d,]+(?: of [\d,]+ read so far)?)/);
  if (!match) throw new Error(`could not read the "${label}" value from ${after.slice(0, 40)}`);
  return match[1];
}

const LIBRARY: ExportLibrary = {
  id: "lib-d6",
  name: "Takeout, March",
  adapter: "gmail_mbox",
  adapter_label: "Google Takeout mailbox",
  detected_from: "an mbox with 4,000 From_ lines",
  status: "syncing",
};

/**
 * MID-INDEX, exactly as the defect described it: the index is running, no
 * summary has been published, and the last items read came back filtered to
 * items with an attachment — 158 of the 4,000 rows read so far.
 */
const MID_INDEX_FACTS: ExportPageFacts = {
  total: 4000,
  filteredTotal: 158,
  filterDescription: "with an attachment",
  filter: { has_attachment: true },
  rowProblems: [],
};

function midIndexCounts() {
  return deriveExportCounts({
    summary: null,
    indexedSoFar: 4000,
    indexing: true,
    facts: MID_INDEX_FACTS,
  });
}

function cardText(counts: ReturnType<typeof midIndexCounts>): string {
  return render(
    <LibrarySummary
      library={LIBRARY}
      summary={null}
      counts={counts}
      ownerOverride={null}
      onPickOwner={() => {}}
      onNarrow={() => {}}
    />,
  );
}

function listText(counts: ReturnType<typeof midIndexCounts>): string {
  return render(<ExportListTotals counts={counts} />);
}

// ─── The guard ───────────────────────────────────────────────────────────────

describe("D6 — one source of truth for every count on the export screen", () => {
  it("mid-index, the card's attachment number equals the list header's", () => {
    const counts = midIndexCounts();

    const card = statValue(cardText(counts), "With a file");
    const line = listText(counts);

    const cardNumbers = numbersIn(card);
    const lineNumbers = numbersIn(line);

    // The card must have a number at all — an em-dash beside a list header
    // that is showing 158 is the defect.
    expect(card).not.toBe("—");
    expect(cardNumbers.length).toBeGreaterThan(0);

    // THE ASSERTION. The same quantity, in both places, from one object.
    expect(cardNumbers[0]).toBe(lineNumbers[0]);
    expect(cardNumbers[0]).toBe(MID_INDEX_FACTS.filteredTotal);

    // And the whole they are a part of agrees too.
    expect(cardNumbers[1]).toBe(lineNumbers[1]);
    expect(cardNumbers[1]).toBe(MID_INDEX_FACTS.total);
  });

  it("a partial count says what it is partial of, and that it is not final", () => {
    const counts = midIndexCounts();

    expect(statValue(cardText(counts), "With a file")).toBe(
      "158 of 4,000 read so far",
    );
    expect(listText(counts)).toContain("158 of 4,000 items in this export read so far");
  });

  it("the card's item total is the list header's item total, not the stream's", () => {
    // The stream is AHEAD of what has been persisted — the reader has seen
    // 4,812 rows, 4,000 of which are browsable. The screen must not show both.
    const counts = deriveExportCounts({
      summary: null,
      indexedSoFar: 4812,
      indexing: true,
      facts: MID_INDEX_FACTS,
    });

    const cardItems = numbersIn(statValue(cardText(counts), "Items"));
    const lineNumbers = numbersIn(listText(counts));

    expect(cardItems[0]).toBe(lineNumbers[1]);
    expect(cardItems[0]).toBe(4000);
  });

  it("once the summary lands, both sides move to it together", () => {
    const summary: ExportSummary = {
      total_items: 4210,
      counts_by_kind: { email: 4210 },
      counts_by_direction: { outbound: 900, inbound: 3310 },
      counts_by_label: {},
      top_containers: [],
      date_range: { earliest: null, latest: null, span_days: null },
      top_correspondents: [],
      total_chars: 10,
      total_words: 2,
      with_attachments: 171,
      owner_identity: "me@example.com",
      owner_identity_basis: "the most frequent From address",
      warnings: [],
    };
    const counts = deriveExportCounts({
      summary,
      indexedSoFar: 4210,
      indexing: false,
      facts: { ...MID_INDEX_FACTS, total: 4210, filteredTotal: 171 },
    });

    expect(statValue(cardText(counts), "With a file")).toBe("171");
    const line = listText(counts);
    expect(numbersIn(line)[0]).toBe(171);
    expect(line).not.toContain("read so far");
  });

  it("invents nothing when no source has a number", () => {
    const counts = deriveExportCounts({
      summary: null,
      indexedSoFar: null,
      indexing: true,
      facts: null,
    });

    // "counting…" while the index runs is a state, not a number; the list
    // header is absent entirely rather than claiming "0 of 0".
    expect(statValue(cardText(counts), "Items")).toBe("counting…");
    expect(listText(counts)).toBe("");

    const idle = deriveExportCounts({
      summary: null,
      indexedSoFar: null,
      indexing: false,
      facts: null,
    });
    expect(statValue(cardText(idle), "Items")).toBe("—");
  });

  it("a read narrowed by more than the attachment axis is not offered as the attachment count", () => {
    // 158 items that have an attachment AND are under 200 characters is not
    // "how many items have a file" — offering it as that would be a number
    // measuring something other than its label.
    const counts = deriveExportCounts({
      summary: null,
      indexedSoFar: 4000,
      indexing: true,
      facts: {
        ...MID_INDEX_FACTS,
        filter: { has_attachment: true, max_chars: 199 },
      },
    });

    expect(counts.withAttachments.value).toBeNull();
    expect(statValue(cardText(counts), "With a file")).toBe("counting…");
  });
});
