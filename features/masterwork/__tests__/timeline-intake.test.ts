/**
 * THE TIMELINE LANE'S REQUEST AND ITS ANSWER (unfolding-case contract §5).
 *
 * The dialog's Distil button and this test go through the SAME
 * `buildTimelineRequest`, so what is asserted here is the body the server
 * receives — not a hand-copied twin of it that can drift.
 *
 * What it forces:
 *   1. The exact wire shape: `{rulebook_id, text, title, role, source_meta:
 *      {licence, url, published, external_id}}`.
 *   2. Every refusal names a remedy and nothing is silently dropped — a case
 *      with no licence, no title, or no real narrative never reaches a paid run.
 *   3. A held-out result NEVER carries the resolution into the summary, and a
 *      case the unfolder could not read out says so rather than reporting "0
 *      rules added" as if that were a result.
 */

import {
  buildTimelineRequest,
  describeTimelineIngest,
  parseTimelineSummary,
} from "../components/detail/IngestTimelineDialog";

const NARRATIVE =
  "Hour 0: she arrived febrile at 39.1 with a stiff neck and the worst headache of her life. ".repeat(
    8,
  );

const GOOD = {
  rulebookId: "rb-1",
  title: "  Case 14 — fever and a stiff neck  ",
  text: NARRATIVE,
  role: "teaching" as const,
  licence: " CC BY 4.0 ",
  url: " https://example.org/case-14 ",
  published: "2026-03-02",
  externalId: " PMID:1234 ",
};

describe("buildTimelineRequest — the wire shape", () => {
  it("posts exactly what the server contract names, trimmed", () => {
    const built = buildTimelineRequest(GOOD);
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.body).toEqual({
      rulebook_id: "rb-1",
      text: NARRATIVE,
      title: "Case 14 — fever and a stiff neck",
      role: "teaching",
      source_meta: {
        licence: "CC BY 4.0",
        url: "https://example.org/case-14",
        published: "2026-03-02",
        external_id: "PMID:1234",
      },
    });
  });

  it("sends the held-out role through unchanged", () => {
    const built = buildTimelineRequest({ ...GOOD, role: "heldout" });
    if ("error" in built) throw new Error(built.error);
    expect(built.body.role).toBe("heldout");
  });

  it("nulls the optional source facts rather than inventing them", () => {
    const built = buildTimelineRequest({
      ...GOOD,
      url: "",
      published: "",
      externalId: "",
    });
    if ("error" in built) throw new Error(built.error);
    expect(built.body.source_meta).toEqual({
      licence: "CC BY 4.0",
      url: null,
      published: null,
      external_id: null,
    });
  });

  it("refuses a titleless, sourceless or too-short case, and says what to do", () => {
    const noTitle = buildTimelineRequest({ ...GOOD, title: "   " });
    expect("error" in noTitle && noTitle.error).toMatch(/title/i);

    const short = buildTimelineRequest({ ...GOOD, text: "It went badly." });
    expect("error" in short && short.error).toMatch(/order it happened/i);

    const noLicence = buildTimelineRequest({ ...GOOD, licence: "" });
    expect("error" in noLicence && noLicence.error).toMatch(/licence/i);
  });
});

describe("parseTimelineSummary + describeTimelineIngest", () => {
  const unfolded = {
    __kind: "serial_observation_timeline",
    title: "Case 14",
    steps: [{ step: 1 }, { step: 2 }, { step: 3 }],
  };

  it("reads a teaching result, drafts and all", () => {
    const summary = parseTimelineSummary({
      corpus_item_id: "ci-1",
      role: "teaching",
      timeline: unfolded,
      added: 4,
      duplicates_skipped: 1,
      quotes_unverified: 0,
    });
    expect(summary).not.toBeNull();
    expect(summary!.steps).toBe(3);
    const sentence = describeTimelineIngest(summary!);
    expect(sentence).toContain("3 steps read out of the case");
    expect(sentence).toContain("4 suggested rules added as drafts");
    expect(sentence).toContain("1 duplicates skipped");
  });

  it("says a held-out case is sealed and never mentions an outcome", () => {
    const summary = parseTimelineSummary({
      corpus_item_id: "ci-2",
      role: "heldout",
      timeline: unfolded,
      added: 0,
    })!;
    const sentence = describeTimelineIngest(summary);
    expect(sentence).toContain("sealed as a held-out case");
    expect(sentence).toContain("no rules came from it");
    expect(sentence).not.toMatch(/rules added as drafts/);
  });

  it("says out loud when no steps could be read, instead of reporting zero rules", () => {
    const summary = parseTimelineSummary({
      corpus_item_id: "ci-3",
      role: "teaching",
      timeline: { __kind: "serial_observation_timeline", title: "x", steps: [] },
      added: 0,
    })!;
    expect(describeTimelineIngest(summary)).toMatch(
      /no steps could be read out of it/,
    );
  });

  it("rejects a payload that is not a timeline result", () => {
    expect(parseTimelineSummary({ added: 3 })).toBeNull();
    expect(parseTimelineSummary(null)).toBeNull();
  });
});
