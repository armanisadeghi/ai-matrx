/**
 * Which full screen a hit opens in the peek, and where inside it: per kind,
 * with the light peek as the fallback for any kind not on the parity list.
 */
import { embedFor, findMessageGroup, EMBED_PARITY } from "@/features/knowledge/hub/embeds/embedFor";
import { deepLinkSeekMs } from "@/features/source-studio/sourceStudioModel";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

const hit = (h: Partial<KnowledgeHit>): KnowledgeHit => ({ entity: "note", id: "x", title: "T", ...h });

describe("embedFor — the embed is chosen by kind", () => {
  it("a web Source opens the Source screen's web path", () => {
    for (const kind of ["web_page", "scrape_parsed_page"]) {
      expect(embedFor(hit({ entity: "processed_document", id: "s1", source_kind: kind }))).toEqual({
        kind: "web",
        sourceId: "s1",
        deepLink: { page: null, chunkId: null, assets: false, ms: null },
      });
    }
  });

  it("a PDF/file Source opens the file path, at the passage's page", () => {
    const e = embedFor(
      hit({
        entity: "segment",
        id: "chunk-9",
        source_kind: "cld_file",
        segment: { source_id: "s2", source_title: "Deck", page_numbers: [7, 8], locator: "p. 7" },
      }),
    );
    expect(e).toEqual({ kind: "file", sourceId: "s2", deepLink: { page: 7, chunkId: "chunk-9", assets: false, ms: null } });
  });

  it("the page comes from the locator when the passage carries no page list", () => {
    const e = embedFor(
      hit({ entity: "segment", id: "c", segment: { source_id: "s", source_title: "", source_kind: "cld_file", locator: "p. 12" } }),
    );
    expect(e && "deepLink" in e ? e.deepLink.page : null).toBe(12);
  });

  it("a transcript / YouTube Source opens the timed path and carries the hit's t0_ms", () => {
    const e = embedFor(
      hit({
        entity: "segment",
        id: "chunk-3",
        source_kind: "transcript",
        segment: { source_id: "s3", source_title: "Talk", t0_ms: 65_000 },
      }),
    );
    expect(e).toEqual({ kind: "transcript", sourceId: "s3", deepLink: { page: null, chunkId: "chunk-3", assets: false, ms: 65_000 } });
    expect(embedFor(hit({ entity: "processed_document", id: "y", source_kind: "youtube_video" }))?.kind).toBe("transcript");
  });

  it("a conversation opens the thread, at the matched message when the hit came from Messages", () => {
    expect(
      embedFor(hit({ entity: "conversation", id: "cv", matches: [{ message_id: "m-2" }, { message_id: "m-5" }] })),
    ).toEqual({ kind: "conversation", conversationId: "cv", messageId: "m-2" });
    expect(embedFor(hit({ entity: "conversation", id: "cv" }))).toEqual({
      kind: "conversation",
      conversationId: "cv",
      messageId: null,
    });
  });

  it("a note opens the note editor", () => {
    expect(embedFor(hit({ entity: "note", id: "n1" }))).toEqual({ kind: "note", noteId: "n1" });
  });

  it("every other kind falls back to the light peek", () => {
    expect(embedFor(hit({ entity: "project", id: "p" }))).toBeNull();
    // A Source of a kind with no embed yet, or no kind reported.
    expect(embedFor(hit({ entity: "processed_document", id: "s", source_kind: "inline" }))).toBeNull();
    expect(embedFor(hit({ entity: "processed_document", id: "s" }))).toBeNull();
    expect(embedFor(hit({ entity: "segment", id: "c" }))).toBeNull();
  });

  it("the parity list is the gate: every kind embedFor can return is on it", () => {
    expect(Object.keys(EMBED_PARITY).sort()).toEqual(["conversation", "file", "note", "transcript", "transcript_record", "web"]);
  });

  it("a transcript record opens its own screen in the peek (text and player), never the light peek", () => {
    expect(embedFor(hit({ entity: "transcript", id: "t" }))).toEqual({ kind: "transcript_record", transcriptId: "t" });
  });
});

describe("the deep link's seek", () => {
  it("an explicit t0_ms wins; a chunk plays from its portion; a page-only link does not seek", () => {
    const timed = { page_index: 1, page_number: 2, portion_kind: "segment", locator: { t0_ms: 30_000 } };
    expect(deepLinkSeekMs({ ms: 65_000, chunkId: "c" }, timed)).toBe(65_000);
    expect(deepLinkSeekMs({ ms: null, chunkId: "c" }, timed)).toBe(30_000);
    expect(deepLinkSeekMs({ ms: null, chunkId: null }, timed)).toBeNull();
    expect(deepLinkSeekMs({ ms: null, chunkId: "c" }, { ...timed, locator: { page: 3 } })).toBeNull();
  });
});

describe("findMessageGroup — scroll to the hit", () => {
  it("finds the group by ANY of its message ids, not just the last", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-message-group data-message-ids="u1"></div>
      <div data-message-group data-message-ids="a1 a2 a3" id="turn"></div>`;
    expect(findMessageGroup(root, "a2")?.id).toBe("turn");
    expect(findMessageGroup(root, "a")).toBeNull();
  });
});
