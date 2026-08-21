/**
 * These pin the ONE rule the editor and the builder must agree on: the words on
 * screen are the words that ship. The server half is
 * `page_pipeline.approved_content` (recency wins, tolerant of a stale shape) —
 * if a case here changes, that function changes in the same unit of work.
 */
import type { PlanNodeArtifactRow } from "../types";
import {
  draftWordCount,
  isReviewStale,
  parsePageDraft,
  resolvePageDraft,
} from "./page-draft";

function artifact(
  kind: string,
  createdAt: string,
  content: unknown,
  options: { superseded?: boolean; human?: boolean } = {},
): PlanNodeArtifactRow {
  return {
    content: content as PlanNodeArtifactRow["content"],
    created_at: createdAt,
    created_by: null,
    deleted_at: null,
    id: `${kind}-${createdAt}`,
    kind,
    metadata: {},
    node_id: "node",
    organization_id: "org",
    produced_by: options.human
      ? ({ authored_by: "human" } as PlanNodeArtifactRow["produced_by"])
      : ({ slot_key: "content_plan.p4_write" } as PlanNodeArtifactRow["produced_by"]),
    site_id: "site",
    step: kind === "review" ? "p5_review" : "p4_write",
    summary: null,
    updated_at: createdAt,
    updated_by: null,
    valid_to: options.superseded ? "2026-08-16T00:00:00.000Z" : null,
    version: 1,
  };
}

const draftContent = (h1: string) => ({
  __kind: "plan_page_draft",
  h1,
  intro: "Intro line.",
  sections: [
    { heading: "What we do", level: 2, intent: "Explain the service", body: "Body prose here.", bullets: ["one", "two"] },
  ],
  call_to_action: "Book a consultation",
  meta_title: "Title",
  meta_description: "Description",
});

const reviewContent = (h1: string) => ({
  __kind: "plan_page_review",
  verdict: "revised",
  issues: [{ severity: "blocker", section: "What we do", problem: "Invented a statistic", fix: "Removed it" }],
  revised: draftContent(h1),
});

describe("resolvePageDraft", () => {
  it("returns null when the page was never written", () => {
    expect(resolvePageDraft([])).toBeNull();
  });

  it("reads the review's revised draft when the review is newest", () => {
    const resolved = resolvePageDraft([
      artifact("draft", "2026-08-15T10:00:00.000Z", draftContent("Written")),
      artifact("review", "2026-08-15T11:00:00.000Z", reviewContent("Reviewed")),
    ]);
    expect(resolved?.source).toBe("review");
    expect(resolved?.draft.h1).toBe("Reviewed");
    expect(resolved?.issues).toHaveLength(1);
  });

  it("a HUMAN edit beats an older review — recency wins, as the builder does", () => {
    const resolved = resolvePageDraft([
      artifact("review", "2026-08-15T11:00:00.000Z", reviewContent("Reviewed")),
      artifact("draft", "2026-08-15T12:00:00.000Z", draftContent("Edited by hand"), { human: true }),
    ]);
    expect(resolved?.source).toBe("draft");
    expect(resolved?.draft.h1).toBe("Edited by hand");
    expect(resolved?.humanAuthored).toBe(true);
  });

  it("ignores superseded revisions — only the current row of each kind counts", () => {
    const resolved = resolvePageDraft([
      artifact("draft", "2026-08-15T18:00:00.000Z", draftContent("Old"), { superseded: true }),
      artifact("draft", "2026-08-15T12:00:00.000Z", draftContent("Current")),
    ]);
    expect(resolved?.draft.h1).toBe("Current");
  });

  it("degrades to the next-newest record when the newest no longer parses", () => {
    const resolved = resolvePageDraft([
      artifact("review", "2026-08-15T13:00:00.000Z", { verdict: "revised", issues: [], revised: { nope: true } }),
      artifact("draft", "2026-08-15T12:00:00.000Z", draftContent("Still readable")),
    ]);
    expect(resolved?.source).toBe("draft");
    expect(resolved?.draft.h1).toBe("Still readable");
  });
});

describe("isReviewStale", () => {
  it("is false with no review, and false while the review is newest", () => {
    expect(isReviewStale([artifact("draft", "2026-08-15T12:00:00.000Z", draftContent("A"))])).toBe(false);
    expect(
      isReviewStale([
        artifact("draft", "2026-08-15T10:00:00.000Z", draftContent("A")),
        artifact("review", "2026-08-15T11:00:00.000Z", reviewContent("A")),
      ]),
    ).toBe(false);
  });

  it("is true once a newer draft exists — the reviewer never saw these words", () => {
    expect(
      isReviewStale([
        artifact("review", "2026-08-15T11:00:00.000Z", reviewContent("A")),
        artifact("draft", "2026-08-15T12:00:00.000Z", draftContent("A"), { human: true }),
      ]),
    ).toBe(true);
  });
});

describe("parsePageDraft / draftWordCount", () => {
  it("rejects an object that carries no page", () => {
    expect(parsePageDraft({ verdict: "approved" })).toBeNull();
    expect(parsePageDraft(null)).toBeNull();
  });

  it("keeps a heading-only draft (a page being built up section by section)", () => {
    expect(parsePageDraft({ h1: "New page" })?.sections).toEqual([]);
  });

  it("counts every field a reader sees", () => {
    const draft = parsePageDraft(draftContent("Page"));
    expect(draft).not.toBeNull();
    // intro 2 + cta 3 + heading 3 + body 3 + bullets 2
    expect(draftWordCount(draft!)).toBe(13);
  });
});
