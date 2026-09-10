/**
 * The honesty rules of the Source & Usage tab and the reference fleet board
 * (campaign L7 · DESIGN §4.6 · ruling D21).
 *
 * These are pinned as tests because each one is a sentence a screen shows a
 * human, and each has exactly one way to be wrong:
 *
 *  * The empty state must NAME the repositories nobody has finished scanning,
 *    and must never contain the word "unused".
 *  * A payload that is not the report must be REFUSED, so a bad response can
 *    never render as an honest-looking empty list.
 */

import {
  SINGLE_SITE_SENTENCE,
  formatRepoList,
  isMandateReferenceBoard,
  isMandateReferenceReport,
  unreportedSentence,
  type MandateReferenceReport,
} from "../references";

function report(
  overrides: Partial<MandateReferenceReport> = {},
): MandateReferenceReport {
  return {
    mandate_key: "seo.keyword_cluster",
    defined_in: [],
    used_by: [],
    flags: [],
    scan_completeness: {},
    unscanned_repos: [],
    single_consumption_site_by_design: false,
    source: "mandate.reference",
    ...overrides,
  } as MandateReferenceReport;
}

describe("the empty state never says unused", () => {
  it("names every repository with no complete scan", () => {
    const sentence = unreportedSentence(
      report({ unscanned_repos: ["aidream", "matrx-frontend", "matrx-local"] }),
    );
    expect(sentence).toBe(
      "No references reported yet for aidream, matrx-frontend and matrx-local.",
    );
    expect(sentence.toLowerCase()).not.toContain("unused");
  });

  it("says so plainly when coverage IS complete and there is still nothing", () => {
    const sentence = unreportedSentence(report({ unscanned_repos: [] }));
    expect(sentence).toContain("every repository has a complete scan");
    expect(sentence.toLowerCase()).not.toContain("unused");
  });

  it("reads naturally for one and for two repositories", () => {
    expect(formatRepoList(["aidream"])).toBe("aidream");
    expect(formatRepoList(["aidream", "matrx-extend"])).toBe(
      "aidream and matrx-extend",
    );
    expect(formatRepoList([])).toBe("no repositories");
  });
});

describe("a payload that is not the report is refused", () => {
  it("accepts the real shape", () => {
    expect(isMandateReferenceReport(report())).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "ok"],
    ["an array", []],
    ["an empty object", {}],
    ["a report with no source stamp", { ...report(), source: undefined }],
    ["a report from somewhere else", { ...report(), source: "guesswork" }],
    ["a report with no used_by array", { ...report(), used_by: undefined }],
    [
      "a report whose completeness map is missing",
      { ...report(), scan_completeness: undefined },
    ],
  ])("refuses %s", (_label, value) => {
    expect(isMandateReferenceReport(value)).toBe(false);
  });

  it("narrows the board independently", () => {
    expect(
      isMandateReferenceBoard({
        repos: [],
        conversion_list: [],
        conversion_count: 0,
        conversion_counts_by_repo: {},
        open_finding_count: 0,
        unverified_repos: ["aidream"],
        source: "mandate.reference",
      }),
    ).toBe(true);
    expect(isMandateReferenceBoard({ repos: [], source: "mandate.reference" })).toBe(
      false,
    );
    expect(isMandateReferenceBoard(report())).toBe(false);
  });
});

describe("app.* and shortcut.* keys", () => {
  it("carry the by-design sentence rather than an implied gap", () => {
    expect(SINGLE_SITE_SENTENCE).toBe("one consumption site by design");
  });
});
