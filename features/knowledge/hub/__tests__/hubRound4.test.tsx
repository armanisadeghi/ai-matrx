/**
 * Round 4 of the Transcripts view (independent walk, 2026-09-28): filters and
 * counts are the server's over the whole set; a search keeps the view and a
 * matching passage folds into its item; titles read as text; a tag is one
 * name; the board groups by what splits; the table carries no empty columns.
 */
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { ResultHandlers } from "@/features/knowledge/hub/components/HubResultRow";
import { aroundMatch } from "@/features/knowledge/hub/components/HubResultRow";
import { boardGroups, hubTableColumns, searchHitsByItem } from "@/features/knowledge/hub/components/HubResults";
import { cleanSnippet, plainText } from "@/features/knowledge/hub/hubPresentation";
import { mergeTagsByName } from "@/features/knowledge/hub/tags/TagsSidebarGroup";
import {
  hitFromTranscriptRow,
  transcriptScopeOf,
  transcriptServerFilters,
} from "@/features/knowledge/hub/transcripts/useTranscriptList";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";

const handlers = { selected: new Set(), focusedKey: null, peekKey: null } as unknown as ResultHandlers;

describe("the Transcripts view asks the server", () => {
  it("maps the hub's facets onto the list's server filters (scope is the list's own scope)", () => {
    expect(
      transcriptServerFilters({ status: ["draft"], folder: ["Calls"], visibility: ["public"], tag: ["q3"], kind: ["session"], scope: ["mine"] }),
    ).toEqual({
      status: { values: ["draft"] },
      folder_name: { values: ["Calls"] },
      visibility: { values: ["public"] },
      tags: { values: ["q3"] },
      kind: { values: ["session"] },
    });
    expect(transcriptScopeOf({})).toBe("orgs");
    expect(transcriptScopeOf({ scope: ["shared"] })).toBe("shared");
  });

  it("each list row becomes a hit on its kind's own registry token", () => {
    const row = (kind: string) =>
      ({ id: "x", kind, title: "T", created_by: "u", owner_email: "a@b.c", organization_id: "o", created_at: "", updated_at: "", tags: [] }) as unknown as TranscriptListRow;
    expect(hitFromTranscriptRow(row("transcript")).entity).toBe("transcript");
    expect(hitFromTranscriptRow(row("session")).entity).toBe("studio_session");
    expect(hitFromTranscriptRow(row("cleanup")).entity).toBe("studio_session");
    expect(hitFromTranscriptRow(row("unsorted")).entity).toBe("studio_recording_segments");
    expect(hitFromTranscriptRow(row("transcript")).captured_by).toEqual({ id: "u", name: "a@b.c" });
  });
});

describe("a search keeps the view", () => {
  const section = (key: string, items: KnowledgeHit[]): SectionState =>
    ({ key, status: "ready", section: { key, label: key, count: items.length, items, next_cursor: null }, loadingMore: false, moreError: null }) as SectionState;
  it("folds a matching passage into its item, and makes an item of a passage whose item is not listed", () => {
    const src = { entity: "processed_document", id: "p1", title: "Forklift safety", snippet: "Opening words" } as KnowledgeHit;
    const seg = (id: string, source: string, text: string) =>
      ({ entity: "segment", id, title: "", snippet: text, segment: { source_id: source, source_title: `Source ${source}` } }) as KnowledgeHit;
    const out = searchHitsByItem([
      section("sources", [src]),
      section("segments", [seg("s1", "p1", "forklift inspections happen"), seg("s2", "p1", "second"), seg("s3", "p2", "a forklift again")]),
    ]);
    expect(out.map((h) => `${h.entity}:${h.id}`)).toEqual(["processed_document:p1", "processed_document:p2"]);
    expect(out[0].snippet).toBe("forklift inspections happen");
    expect(out[1].title).toBe("Source p2");
  });

  it("a long passage starts near the match so the highlight is on screen", () => {
    const text = `${"lorem ipsum dolor sit amet ".repeat(6)}the forklift passes inspection every shift`;
    expect(aroundMatch(text, "forklift").startsWith("…")).toBe(true);
    expect(aroundMatch(text, "forklift")).toContain("forklift");
    expect(aroundMatch("short forklift", "forklift")).toBe("short forklift");
  });
});

describe("text as a person reads it", () => {
  it("strips HTML and decodes entities in titles", () => {
    expect(plainText("Why <b>OpenAI</b> &amp; friends &#39;won&#39;")).toBe("Why OpenAI & friends 'won'");
    expect(plainText("Plain")).toBe("Plain");
  });
  it("drops transcript scaffolding from snippets", () => {
    expect(cleanSnippet("[Music] Speaker 1: hello there [Applause] Unknown: again")).toBe("hello there again");
  });
});

describe("one tag, one name", () => {
  it("merges tags that differ only by case or spacing, adding their counts", () => {
    const tags = [
      { id: "a", name: "rulebook", slug: "rulebook", organizationId: "o1", count: 3 },
      { id: "b", name: "Rulebook ", slug: "rulebook", organizationId: "o2", count: 2 },
      { id: "c", name: "understudy", slug: "understudy", organizationId: "o1", count: 1 },
    ];
    expect(mergeTagsByName(tags)).toEqual([
      { key: "rulebook", name: "rulebook", count: 5, ids: ["a", "b"] },
      { key: "understudy", name: "understudy", count: 1, ids: ["c"] },
    ]);
  });
});

describe("board and table", () => {
  const t = (id: string, origin: string | null, updated: string) =>
    ({ entity: "transcript", id, title: id, source_kind: "transcript", origin, updated_at: updated }) as KnowledgeHit;
  it("a single-kind board groups by the next field that splits the rows", () => {
    const hits = [t("a", "youtube", "2026-09-27T10:00:00Z"), t("b", null, "2026-09-27T10:00:00Z")];
    expect(boardGroups(hits, handlers).by).toBe("origin");
    const sameOrigin = [t("a", null, new Date().toISOString()), t("b", null, "2025-01-01T00:00:00Z")];
    expect(boardGroups(sameOrigin, handlers).by).toBe("date");
  });
  it("a column no row has a value for is absent; Kind is absent when every row is one kind", () => {
    const hits = [t("a", null, "2026-09-27T10:00:00Z"), t("b", null, "2026-09-27T10:00:00Z")];
    const ids = hubTableColumns(undefined, handlers, hits).map((c) => c.id);
    expect(ids).not.toContain("captured_by");
    expect(ids).not.toContain("origin");
    expect(ids).not.toContain("filed");
    expect(ids).not.toContain("kind");
    expect(ids).toContain("title");
  });
});
