/**
 * Round 2 of the Transcripts view (2026-09-27): rows show what is inside —
 * opening words, channel, poster frame — the list is sectioned by day like
 * Granola, and the empty view says so with a real way forward.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  buildTranscriptContent,
  snippetFromSegments,
  transcriptRowContent,
  transcriptRowFacts,
  rowFromTranscript,
  type TranscriptRecordFields,
} from "@/features/knowledge/hub/transcripts/transcriptRows";
import { dateGroupOf, dateInGroup, groupByDate } from "@/features/knowledge/hub/dateGroups";
import { BrowseResults } from "@/features/knowledge/hub/components/HubResults";
import { resultRowHeight, titleLinesFor, type ResultHandlers } from "@/features/knowledge/hub/components/HubResultRow";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

const record = (over: Partial<TranscriptRecordFields>): TranscriptRecordFields => ({
  id: "t1",
  title: "T",
  description: null,
  is_draft: false,
  folder_name: null,
  tags: null,
  visibility: null,
  metadata: {},
  organization_id: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  processed_document_id: null,
  ...over,
});

describe("row content", () => {
  it("joins the opening segments, drops time stamps and cuts on a word near 160 characters", () => {
    expect(snippetFromSegments(["[00:00:02] Unknown: Most of you will", "probably know", null])).toBe(
      "Most of you will probably know",
    );
    const long = snippetFromSegments(Array.from({ length: 6 }, () => "the vacuum is actually not empty and contains energy"))!;
    expect(long.length).toBeLessThanOrEqual(161);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
    expect(snippetFromSegments([null, "  "])).toBeNull();
  });

  it("a YouTube capture gives its channel, poster and length; an unnamed speaker is never listed", () => {
    const yt = record({
      metadata: {
        media: { adapter: "youtube", external_id: "Rf2FBCmv0IU", channel_title: "Huygens Optics", duration_seconds: 1440 },
        speakers: ["Unknown", "Speaker 1"],
      },
      seg0: "When Thomas Young demonstrated the wave",
    });
    const c = transcriptRowContent(yt);
    expect(c).toEqual({
      snippet: "When Thomas Young demonstrated the wave",
      channel: "Huygens Optics",
      speakers: [],
      thumbnailUrl: "https://i.ytimg.com/vi/Rf2FBCmv0IU/mqdefault.jpg",
    });
    // The video's own length is the row's duration when the recorder wrote none.
    expect(transcriptRowFacts(rowFromTranscript(yt, null), c)).toEqual(["Huygens Optics", "24 min"]);
  });

  it("names up to two speakers, counts more", () => {
    const two = transcriptRowContent(record({ metadata: { speakers: ["Ava", "Ben"] } }));
    expect(transcriptRowFacts(rowFromTranscript(record({}), null), two)).toEqual(["Ava, Ben"]);
    const three = transcriptRowContent(record({ metadata: { speakers: ["Ava", { name: "Ben" }, "Cy"] } }));
    expect(transcriptRowFacts(rowFromTranscript(record({}), null), three)).toEqual(["3 speakers"]);
  });

  it("a Source reads the transcript it came from, or — when it is an edited version — the one its original links to", () => {
    const t = record({ id: "t9", processed_document_id: "pd-original", seg0: "Hello there" });
    const hits = [
      { entity: "processed_document", id: "pd-original", title: "A", source_kind: "transcript" },
      { entity: "processed_document", id: "pd-edit", title: "A (edited)", source_kind: "transcript" },
      { entity: "processed_document", id: "pd-lonely", title: "B", source_kind: "transcript" },
    ] as KnowledgeHit[];
    const map = buildTranscriptContent(hits, [t], new Map([["pd-edit", "pd-original"]]));
    expect(map.get("processed_document:pd-original")?.snippet).toBe("Hello there");
    expect(map.get("processed_document:pd-edit")?.snippet).toBe("Hello there");
    expect(map.has("processed_document:pd-lonely")).toBe(false);
  });
});

describe("date sections", () => {
  const now = new Date(2026, 8, 27, 15, 0);
  const at = (d: Date) => d.toISOString();
  it("Today, Yesterday, Previous 7 days, Previous 30 days, then months (with the year when it differs)", () => {
    expect(dateGroupOf(at(new Date(2026, 8, 27, 9)), now).label).toBe("Today");
    expect(dateGroupOf(at(new Date(2026, 8, 26, 23)), now).label).toBe("Yesterday");
    expect(dateGroupOf(at(new Date(2026, 8, 22)), now).label).toBe("Previous 7 days");
    expect(dateGroupOf(at(new Date(2026, 8, 5)), now).label).toBe("Previous 30 days");
    expect(dateGroupOf(at(new Date(2026, 6, 4)), now).label).toBe("July");
    expect(dateGroupOf(at(new Date(2025, 11, 9)), now).label).toBe("December 2025");
    expect(dateGroupOf(null, now).label).toBe("No date");
  });
  it("inside a section the row says the time today, the day before that", () => {
    const today = new Date(2026, 8, 27, 12, 35);
    expect(dateInGroup(at(today), dateGroupOf(at(today), now), now)).toBe("12:35 PM");
    const old = new Date(2026, 8, 20);
    expect(dateInGroup(at(old), dateGroupOf(at(old), now), now)).toBe("Sep 20");
  });
  it("one header per run of a section, counting its rows", () => {
    const items = [new Date(2026, 8, 27, 10), new Date(2026, 8, 27, 9), new Date(2026, 8, 26, 9)].map(at);
    const out = groupByDate(items, (x) => x, now);
    expect(out.map((o) => (o.kind === "header" ? `${o.group.label}:${o.count}` : "row"))).toEqual([
      "Today:2",
      "row",
      "row",
      "Yesterday:1",
      "row",
    ]);
  });
});

describe("row geometry", () => {
  const handlers = { selected: new Set(), focusedKey: null, peekKey: null } as unknown as ResultHandlers;
  it("a row is exactly as tall as what it shows, and a narrow pane gives a long title two lines", () => {
    const hit = { entity: "note", id: "1", title: "A title" } as KnowledgeHit;
    expect(resultRowHeight(hit, handlers, 1)).toBe(58);
    expect(resultRowHeight({ ...hit, snippet: "words" }, handlers, 2)).toBe(100);
    expect(titleLinesFor("Vacuum energy density visualized in a lab", 343, true)).toBe(2);
    expect(titleLinesFor("Short", 343, true)).toBe(1);
    expect(titleLinesFor("Vacuum energy density visualized in a lab", 343, false)).toBe(1);
  });
});

describe("the empty view", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("says so with its way forward — no skeleton, no load-more, no rows", () => {
    const sections: SectionState[] = [
      { key: "sources", status: "ready", section: { key: "sources", label: "Sources", count: 0, items: [], next_cursor: null }, loadingMore: false, moreError: null },
    ];
    act(() =>
      root.render(
        <BrowseResults
          layout="list"
          sections={sections}
          hits={[]}
          handlers={{ selected: new Set(), focusedKey: null, peekKey: null, onToggleSelect: jest.fn(), onFocus: jest.fn(), onOpen: jest.fn(), onOpenFull: jest.fn() }}
          emptySentence="No transcripts yet."
          emptyExtra={<a href="/transcripts/new">Record, upload or paste a transcript</a>}
          onShowMore={jest.fn()}
          onRetry={jest.fn()}
          groupByDate
        />,
      ),
    );
    expect(host.textContent).toContain("No transcripts yet.");
    expect(host.querySelector('a[href="/transcripts/new"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain("Load more");
    expect(host.querySelector("[data-hit-key]")).toBeNull();
  });
});
