/**
 * The Source screen's pure decisions (SOURCE-CONVERGENCE §8.2): every old
 * viewer route lands on /knowledge/sources/[id] WITH its params, a deep link
 * opens on its portion, a chunk or portion click seeks to `t0_ms`, and the
 * Original pane shows the right thing for each kind — honestly when there is
 * nothing to play.
 */
import {
  parseSourceDeepLink,
  portionIndexForChunk,
  portionIndexForPage,
  portionStartMs,
  resolveOriginalView,
  snapshotDocument,
  snapshotHtml,
  sourceStudioPath,
  textFragmentUrl,
  youtubeVideoId,
  type SourceOriginalFacts,
} from "@/features/source-studio/sourceStudioModel";

const ID = "1e1fedd0-5d1f-426c-bfef-216de44f5e84";

describe("sourceStudioPath — redirects keep their params", () => {
  it("carries page and chunk from a citation deep link", () => {
    expect(sourceStudioPath(ID, { page: "12", chunk: "c-9" })).toBe(
      `/knowledge/sources/${ID}?page=12&chunk=c-9`,
    );
  });
  it("reads URLSearchParams and array params, keeps assets=1", () => {
    expect(
      sourceStudioPath(ID, new URLSearchParams("assets=1&utm=x&page=3")),
    ).toBe(`/knowledge/sources/${ID}?page=3&assets=1`);
    expect(sourceStudioPath(ID, { page: ["4", "5"] })).toBe(
      `/knowledge/sources/${ID}?page=4`,
    );
  });
  it("drops params it does not honour and empty values", () => {
    expect(sourceStudioPath(ID, { page: "", other: "1" })).toBe(
      `/knowledge/sources/${ID}`,
    );
    expect(sourceStudioPath(ID)).toBe(`/knowledge/sources/${ID}`);
  });
});

describe("deep link → opening portion", () => {
  const portions = [
    { page_index: 0, page_number: 1 },
    { page_index: 1, page_number: 2 },
    { page_index: 2, page_number: 5 },
  ];
  it("parses page / chunk / assets and rejects junk pages", () => {
    expect(parseSourceDeepLink({ page: "3", chunk: "abc" })).toEqual({
      page: 3,
      chunkId: "abc",
      assets: false,
    });
    expect(parseSourceDeepLink({ page: "0" }).page).toBeNull();
    expect(parseSourceDeepLink({ page: "x" }).page).toBeNull();
    expect(parseSourceDeepLink(new URLSearchParams("assets=1")).assets).toBe(
      true,
    );
  });
  it("looks a page number up in the portions, not page - 1", () => {
    expect(portionIndexForPage(5, portions)).toBe(2);
    expect(portionIndexForPage(2, portions)).toBe(1);
    expect(portionIndexForPage(9, [])).toBe(8);
  });
  it("puts a chunk in the portion of its first page number", () => {
    expect(portionIndexForChunk({ page_numbers: [5, 2] }, portions)).toBe(1);
    expect(portionIndexForChunk({ page_numbers: null }, portions)).toBeNull();
  });
});

describe("seek", () => {
  it("a transcript segment starts at its t0_ms", () => {
    expect(portionStartMs({ locator: { t0_ms: 4500, t1_ms: 7000 } })).toBe(
      4500,
    );
    expect(portionStartMs({ locator: { t0_ms: 0 } })).toBe(0);
  });
  it("a page or section has no start time", () => {
    expect(portionStartMs({ locator: { page: 3 } })).toBeNull();
    expect(portionStartMs({ locator: null })).toBeNull();
    expect(portionStartMs(null)).toBeNull();
  });
});

function doc(over: Partial<SourceOriginalFacts>): SourceOriginalFacts {
  return {
    source_kind: "cld_file",
    source_id: "file-1",
    mime_type: "application/pdf",
    original_file_id: null,
    canonical_identity: null,
    metadata: {},
    ...over,
  };
}

describe("resolveOriginalView", () => {
  it("a PDF file Source shows the PDF", () => {
    expect(resolveOriginalView(doc({}))).toEqual({
      kind: "pdf",
      fileId: "file-1",
    });
  });
  it("a transcript with a video plays the video; audio otherwise", () => {
    const t = doc({ source_kind: "transcript", mime_type: "text/plain" });
    expect(
      resolveOriginalView(t, { videoFileId: "v1", audioFileId: "a1" }),
    ).toEqual({ kind: "video", fileId: "v1" });
    expect(
      resolveOriginalView(t, { videoFileId: null, audioFileId: "a1" }),
    ).toEqual({ kind: "audio", fileId: "a1" });
  });
  it("a transcript without media says so — no player", () => {
    const t = doc({ source_kind: "transcript", mime_type: "text/plain" });
    expect(resolveOriginalView(t, null)).toEqual({
      kind: "transcript-no-media",
    });
  });
  it("a YouTube caption transcript embeds the video", () => {
    const t = doc({
      source_kind: "transcript",
      metadata: { final_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(resolveOriginalView(t, null)).toMatchObject({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });
  it("a web Source shows its stored snapshot, else the live address", () => {
    const w = doc({
      source_kind: "scrape_parsed_page",
      mime_type: "text/html",
      canonical_identity: "https://example.com/a",
    });
    expect(resolveOriginalView({ ...w, original_file_id: "snap" })).toEqual({
      kind: "web-snapshot",
      fileId: "snap",
      url: "https://example.com/a",
    });
    expect(resolveOriginalView(w)).toEqual({
      kind: "web-live",
      url: "https://example.com/a",
    });
  });
  it("pasted text is its own original", () => {
    expect(
      resolveOriginalView(doc({ source_kind: "inline", mime_type: "text/plain" })),
    ).toEqual({ kind: "text" });
  });
});

describe("helpers", () => {
  it("youtube ids from watch, short and embed URLs", () => {
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(youtubeVideoId("https://example.com")).toBeNull();
  });
  it("a text fragment of the passage's first words", () => {
    expect(textFragmentUrl("https://e.com/p#top", "## Install on Linux now")).toBe(
      "https://e.com/p#:~:text=Install%20on%20Linux%20now",
    );
    expect(textFragmentUrl("https://e.com/p", "")).toBe("https://e.com/p");
  });
  it("snapshot HTML from a page or an extension capture, never from other JSON", () => {
    expect(snapshotHtml("<html><body>x</body></html>")).toContain("<body>");
    expect(
      snapshotHtml(JSON.stringify({ article: { content: "<p>hi</p>" } })),
    ).toBe("<p>hi</p>");
    expect(snapshotHtml(JSON.stringify({ a: 1 }))).toBeNull();
    expect(snapshotHtml("plain")).toBeNull();
  });
});

describe("snapshotDocument", () => {
  it("adds a base so relative styles resolve; keeps an existing base", () => {
    expect(snapshotDocument("<html><head><title>x</title></head></html>", "https://e.com/a")).toBe(
      '<html><head><base href="https://e.com/a"><title>x</title></head></html>',
    );
    expect(snapshotDocument('<head><base href="/x"></head>', "https://e.com")).toBe(
      '<head><base href="/x"></head>',
    );
    expect(snapshotDocument("<p>hi</p>", null)).toBe("<p>hi</p>");
  });
});
