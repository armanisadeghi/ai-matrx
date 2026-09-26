/**
 * The core stream heal holds back half-arrived inline math and table headers.
 *
 * The break this guards (verify-RC-B7, 2026-09-25): mid-stream, an unclosed
 * single-`$` formula showed its raw TeX (`For $N = 120{`, `$\mathbb`) and a
 * table header plus a half-typed `|---` delimiter showed raw pipes — in live
 * /chat and in the studio replay. Currency must NOT be held back: the rule is
 * the core's single-dollar predicate (@ai-matrx/content-ir/source).
 *
 * Expected values are literal: what the reader should see at that instant.
 */
import { healStreamingMarkdown } from "@/components/markdown-core/stream-heal";

const RATE_ANSWER =
  "Your route cost depends on the stop count. For $N = 120{";

describe("unclosed inline math while streaming", () => {
  it.each([
    // [prefix on screen, expected healed text]
    [RATE_ANSWER, "Your route cost depends on the stop count. For "],
    ["The expected wait is $\\mathbb", "The expected wait is "],
    ["The deposit should be no less than $", "The deposit should be no less than "],
    ["If $V_d = $4{", "If "],
    ["Use $R = 4{,", "Use "],
  ])("holds back %j", (prefix, expected) => {
    expect(healStreamingMarkdown(prefix)).toBe(expected);
  });

  it.each([
    // Currency and complete math stay exactly as written.
    ["The pickup costs $35 per stop and $12 per extra monitor", "The pickup costs $35 per stop and $12 per extra monitor"],
    ["Budget $5 for fuel", "Budget $5 for fuel"],
    // A price is the stream's tail: no closer yet, so the wider closed-span
    // rule (content-ir 0.18.0: `$5$` is math) must not decide — a number with
    // no TeX command keeps showing (`looksLikeOpenInlineMath`).
    ["The deposit is $5", "The deposit is $5"],
    ["Each extra bin costs $12.50", "Each extra bin costs $12.50"],
    ["The margin is $FC", "The margin is $FC"],
    ["A complete formula $x^2$ and then text", "A complete formula $x^2$ and then text"],
    ["Code keeps `$HOME/bin` literal", "Code keeps `$HOME/bin` literal"],
  ])("leaves %j alone", (prefix, expected) => {
    expect(healStreamingMarkdown(prefix)).toBe(expected);
  });

  it("does not touch a dollar inside an open code fence", () => {
    const prefix = "Run this:\n\n```bash\necho $PATH_{";
    expect(healStreamingMarkdown(prefix)).toBe(prefix);
  });
});

const PLAN = "Here is the rollout plan:\n\n";

describe("half-arrived table header while streaming", () => {
  it.each([
    [`${PLAN}| Week | Milestone | Owner | Status |`, PLAN],
    [`${PLAN}| Week | Milestone | Owner | Status |\n|---`, PLAN],
    [`${PLAN}| Week | Milestone | Owner | Status |\n|---|---|`, PLAN],
    [`${PLAN}| Week | Milestone |\n|---|---|\n| 1 | Pilot on Bay St`, `${PLAN}| Week | Milestone |\n|---|---|`],
  ])("holds back %j", (prefix, expected) => {
    expect(healStreamingMarkdown(prefix)).toBe(expected);
  });

  it("shows a table once its delimiter row is complete", () => {
    const prefix = `${PLAN}| Week | Milestone |\n|---|---|\n| 1 | Pilot on Bay St |`;
    expect(healStreamingMarkdown(prefix)).toBe(prefix);
  });

  it("leaves a pipe inside prose alone", () => {
    const prefix = "Choose pickup | drop-off in the app";
    expect(healStreamingMarkdown(prefix)).toBe(prefix);
  });
});

describe("a lone trailing backtick while streaming", () => {
  it.each([
    ["Set the flag `", "Set the flag "],
    ["Run `", "Run "],
  ])("holds back %j", (prefix, expected) => {
    expect(healStreamingMarkdown(prefix)).toBe(expected);
  });

  it("keeps a closed code span", () => {
    expect(healStreamingMarkdown("Set `ROUTE_14_CAPACITY` to 38")).toBe(
      "Set `ROUTE_14_CAPACITY` to 38",
    );
  });
});

// verify-RC-B4 R5-3 (the one GFM table rule, gfm-table-lines): a table written
// WITHOUT edge pipes is held back the same way while its delimiter arrives, and
// prose that merely holds a pipe is never held.
describe("a pipe-less table while streaming", () => {
  const INTRO = "Tonight's handover:\n\n";
  it.each([
    // [prefix on screen, expected healed text]
    [`${INTRO}Step | Task | Who\n---`, INTRO],
    [`${INTRO}Step | Task | Who\n--- | ---`, INTRO],
    [`${INTRO}Step | Task | Who\n--- | --- | ---`, `${INTRO}Step | Task | Who\n--- | --- | ---`],
    [`${INTRO}Step | Task | Who\n--- | --- | ---\n1 | Drain the queue | Tom`, `${INTRO}Step | Task | Who\n--- | --- | ---\n1 | Drain the queue | Tom`],
  ])("holds back %j", (prefix, expected) => {
    expect(healStreamingMarkdown(prefix)).toBe(expected);
  });

  it.each([
    "Use a | b to match either level.",
    "Use a | b to match either level.\nThen restart the shipper.",
    "Use a | b to match either level.\n| Bay | Status |\n| --- | --- |",
  ])("never holds prose with a pipe: %j", (prefix) => {
    expect(healStreamingMarkdown(prefix)).toBe(prefix);
  });
});
