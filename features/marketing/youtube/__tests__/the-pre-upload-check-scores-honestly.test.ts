/**
 * THE PUBLISH-NOTHING PRE-UPLOAD CHECK — red then green with fixed inputs, and
 * the two ways a score can lie.
 *
 * The scoring module is pure, so every assertion here is provable by hand: the
 * same draft always produces the same checklist, and the only thing that moves
 * it is the knob.
 *
 * What this proves:
 *   1. A weak draft scores low with a named reason on every row, and the SAME
 *      draft repaired scores high — red then green, one input at a time.
 *   2. With the keyword required and none given, there is NO score at all and
 *      the sentence says why. A zero would read as "your video is bad".
 *   3. With the keyword NOT required, the keyword rows come back
 *      `not_measured` WITH their reason — never a quiet pass — and the score's
 *      denominator shrinks to the rows that were actually measured.
 *   4. The clipboard block is exactly what is on screen: nothing is appended.
 */

import {
  NEEDS_KEYWORD_SENTENCE,
  preUploadChecks,
  scorePreUpload,
  studioClipboardText,
  type PreUploadDraft,
} from "../preupload";

const WEAK: PreUploadDraft = {
  title: "New video",
  description: "Watch this.",
  tags: [],
  targetKeyword: "commercial roof inspection",
  thumbnailUrl: null,
  thumbnailText: "",
};

const STRONG: PreUploadDraft = {
  title: "Commercial roof inspection: what a leak actually costs you",
  description:
    "A commercial roof inspection finds the three failures that turn a small leak into a deck replacement. " +
    "We walk a 40,000 sq ft membrane roof, show what we look for at every seam and drain, and price the two " +
    "repairs most owners put off. Chapters, the checklist we use, and what to ask a contractor are below.",
  tags: [
    "commercial roof inspection",
    "flat roof leak",
    "roof maintenance",
    "membrane roofing",
    "building owner",
    "roof repair cost",
  ],
  targetKeyword: "commercial roof inspection",
  thumbnailUrl: "https://example.test/thumb.jpg",
  thumbnailText: "ROOF LEAK?",
};

function byId(draft: PreUploadDraft) {
  return Object.fromEntries(preUploadChecks(draft).map((check) => [check.id, check]));
}

describe("a weak draft — red", () => {
  const verdict = scorePreUpload(WEAK, { targetKeywordRequired: true });
  const checks = byId(WEAK);

  it("scores, because the keyword is present, and scores badly", () => {
    expect(verdict.state).toBe("scored");
    if (verdict.state !== "scored") throw new Error("unreachable");
    expect(verdict.score).toBeLessThan(30);
    expect(verdict.measured).toBe(verdict.total);
  });

  it("names what is wrong on every failing row, never a bare grade", () => {
    expect(checks.title_keyword.state).toBe("fail");
    expect(checks.title_keyword.detail).toContain("commercial roof inspection");
    expect(checks.description_keyword.state).toBe("fail");
    expect(checks.tag_count.state).toBe("fail");
    expect(checks.tag_coverage.state).toBe("fail");
    expect(checks.thumbnail.state).toBe("fail");
    expect(checks.thumbnail.detail).toContain("thumbnail");
  });
});

describe("the same draft repaired — green", () => {
  const verdict = scorePreUpload(STRONG, { targetKeywordRequired: true });
  const checks = byId(STRONG);

  it("scores high over every check", () => {
    expect(verdict.state).toBe("scored");
    if (verdict.state !== "scored") throw new Error("unreachable");
    expect(verdict.score).toBeGreaterThanOrEqual(85);
    expect(verdict.measured).toBe(verdict.total);
  });

  it("puts the keyword first in the title and inside the visible snippet", () => {
    expect(checks.title_keyword.state).toBe("pass");
    expect(checks.title_keyword.detail).toContain("opens with");
    expect(checks.description_keyword.state).toBe("pass");
    expect(checks.tag_coverage.detail).toContain("exactly");
  });

  it("warns, never fails, when the keyword is late in the description", () => {
    const late = {
      ...STRONG,
      description: `${"x".repeat(200)} commercial roof inspection`,
    };
    const check = byId(late).description_keyword;
    expect(check.state).toBe("warn");
    expect(check.detail).toContain("150");
  });

  it("fails a title past YouTube's own cap, and says how much is invisible", () => {
    const long = { ...STRONG, title: `Commercial roof inspection ${"a".repeat(120)}` };
    const check = byId(long).title_length;
    expect(check.state).toBe("fail");
    expect(check.detail).toContain("100");
  });
});

describe("no target keyword", () => {
  const draft = { ...STRONG, targetKeyword: "" };

  it("is refused outright when the organization requires one", () => {
    const verdict = scorePreUpload(draft, { targetKeywordRequired: true });
    expect(verdict.state).toBe("needs_keyword");
    if (verdict.state !== "needs_keyword") throw new Error("unreachable");
    expect(verdict.sentence).toBe(NEEDS_KEYWORD_SENTENCE);
    // 🚨 NOT A ZERO. A zero reads as a verdict on the video.
    expect(verdict).not.toHaveProperty("score");
  });

  it("leaves every keyword row NOT MEASURED, with its reason, when it does not", () => {
    const verdict = scorePreUpload(draft, { targetKeywordRequired: false });
    expect(verdict.state).toBe("scored");
    if (verdict.state !== "scored") throw new Error("unreachable");
    const unmeasured = verdict.checks.filter((check) => check.state === "not_measured");
    expect(unmeasured.map((check) => check.id).sort()).toEqual([
      "description_keyword",
      "tag_coverage",
      "title_keyword",
    ]);
    for (const check of unmeasured) {
      expect(check.detail).toContain("Not measured");
      expect(check.earned).toBe(0);
    }
  });

  it("shrinks the DENOMINATOR to what was measured, and says so", () => {
    const verdict = scorePreUpload(draft, { targetKeywordRequired: false });
    if (verdict.state !== "scored") throw new Error("unreachable");
    expect(verdict.measured).toBe(4);
    expect(verdict.total).toBe(7);
    // Every measured row is a pass on this draft, so a denominator that
    // silently included the three unmeasured rows would print 57 instead.
    expect(verdict.score).toBe(100);
  });
});

describe("the block a person pastes into YouTube Studio", () => {
  it("is exactly what is on screen — nothing is appended", () => {
    const text = studioClipboardText(STRONG);
    expect(text).toContain(STRONG.title);
    expect(text).toContain(STRONG.description);
    expect(text).toContain("commercial roof inspection, flat roof leak");
    expect(text).not.toMatch(/AI Matrx|matrx|utm_/i);
  });
});

/**
 * PUBLISHES NOTHING, PROVEN STRUCTURALLY: the scoring module imports nothing
 * that could write, so there is no path from this check to YouTube or to our
 * own database. A future edit that adds one fails here.
 */
describe("the check has no writer", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "preupload.ts"), "utf8");

  it("imports nothing at all — no client, no service, no fetch", () => {
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/supabase/i);
  });
});
