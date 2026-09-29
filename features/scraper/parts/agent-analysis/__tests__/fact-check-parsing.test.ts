/**
 * The Fact Check tab parses the answer the `scraper.fact_check` agent ACTUALLY
 * gives: three Markdown sections (`## Fact-check verdict`, `## Facts &
 * Citations`, `## Warning`) plus one fenced ```json block holding a
 * `fact_check_report` kind.
 *
 * The fixture is a real answer, copied verbatim from chat.message
 * 6e11db9c-0d88-4e18-83b0-53edae6af7ca (2026-09-29). The previous parser looked
 * for the retired agent's headings (FACT CHECK SUMMARY … OVERALL RATING n/10),
 * so on this answer it returned an empty summary and no rating — the tab read
 * "No summary found" and "Trustworthiness: Pending".
 */
import { readFileSync } from "fs";
import { join } from "path";
import { parseFactCheck } from "../fact-check-parsing-util";

const REAL_ANSWER = readFileSync(
  join(__dirname, "fixtures", "fact-check-answer-2026-09-29.md"),
  "utf8",
);

/** The same answer with its fenced JSON block removed. */
const WITHOUT_JSON = REAL_ANSWER.replace(/```json[\s\S]*?```/g, "").trim();

describe("parseFactCheck — the three-section + fact_check_report contract", () => {
  it("reads the verdict section as the summary", () => {
    const parsed = parseFactCheck(REAL_ANSWER);
    expect(parsed.summary).toContain("**Verdict: BLOCKED BY CLAIMS**");
    expect(parsed.summary).toContain("severe internal contradictions");
    // Stops at the next section — never bleeds the claims list in.
    expect(parsed.summary).not.toContain("Claimant");
  });

  it("reads the fact_check_report kind from the fenced JSON block, marker intact", () => {
    const parsed = parseFactCheck(REAL_ANSWER);
    expect(parsed.report).not.toBeNull();
    expect(parsed.report?.__kind).toBe("fact_check_report");
    expect(parsed.report?.verdict).toBe("blocked_by_claims");
    expect(parsed.report?.claims).toHaveLength(11);
    expect(parsed.report?.claims[0].citations[0]).toMatchObject({
      tier: "primary",
      published_at: "2024-03-20",
    });
  });

  it("counts claims per status and carries the verdict", () => {
    const parsed = parseFactCheck(REAL_ANSWER);
    expect(parsed.verdict).toBe("blocked_by_claims");
    expect(parsed.statusCounts).toEqual({
      verified: 7,
      disputed: 2,
      unverifiable: 1,
      missing_source: 1,
    });
  });

  it("reads the warning section WITHOUT the JSON block riding at its end", () => {
    const parsed = parseFactCheck(REAL_ANSWER);
    expect(parsed.warning).toContain("DO NOT PUBLISH OR SEND THIS DRAFT");
    expect(parsed.warning).not.toContain("```");
    expect(parsed.warning).not.toContain("fact_check_report");
  });

  it("reads the Facts & Citations section", () => {
    const parsed = parseFactCheck(REAL_ANSWER);
    expect(parsed.factsAndCitations).toContain("**Claimant:** UNITAR / ITU");
    expect(parsed.factsAndCitations).not.toContain("## Warning");
    expect(parsed.factsAndCitations.trim().endsWith("---")).toBe(false);
  });
});

describe("parseFactCheck — JSON block absent", () => {
  it("has no report, and still has all three sections to fall back on", () => {
    const parsed = parseFactCheck(WITHOUT_JSON);
    expect(parsed.report).toBeNull();
    expect(parsed.statusCounts).toBeNull();
    expect(parsed.summary).toContain("BLOCKED BY CLAIMS");
    expect(parsed.factsAndCitations).toContain("**Status:** Disputed");
    expect(parsed.warning).toContain("DO NOT PUBLISH");
  });

  it("reads the verdict from the verdict line when the kind is absent", () => {
    expect(parseFactCheck(WITHOUT_JSON).verdict).toBe("blocked_by_claims");
  });

  it("ignores a fenced JSON block that is not a fact_check_report", () => {
    const other = `${WITHOUT_JSON}\n\n\`\`\`json\n{"__kind":"something_else","claims":[]}\n\`\`\``;
    expect(parseFactCheck(other).report).toBeNull();
  });
});
