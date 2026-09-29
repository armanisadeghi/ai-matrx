/**
 * THE PRESS ROOM READS THE PROOF THE STORY ENGINE ACTUALLY WRITES.
 *
 * Acceptance 2026-09-29: every story angle in the Press Room said "No proof recorded" while
 * the KPI strip said 19 proofs to gather. The data was there: aidream's Story Engine
 * (`aidream/services/seo/story_engine.py`, free-form dicts from the analyst) writes
 *   proof_required    [{need, why}]
 *   missing_evidence  [{gap, how_to_close}]
 *   evidence_refs     [{excerpt, supports, source_id, source_kind}]
 * — a census of every live `seo.story_angle` row on 2026-09-29 found ONLY these key sets
 * (24 / 20 / 60 entries), and the readers knew none of those spellings, so every entry
 * was "malformed" and every ladder was empty. The fixture below is those real shapes.
 *
 * The same test pins the server's rule (`story_engine.proof_is_satisfied`): silence is
 * NOT satisfaction — a requirement with no explicit flag is still owed.
 */

import { readLadder } from "../ladder";
import { readEntryKeys } from "../types";
import type { StoryAngle } from "../types";

const angle = {
  proof_required: [
    {
      why: "A reporter in 2026 will not write a trend piece based solely on fines from 2014-2018.",
      need: "Recent enforcement data",
    },
    {
      why: "Need a quote from the CEO on how RFPs have changed in the last 12 months.",
      need: "Expert commentary on current corporate behavior",
    },
  ],
  missing_evidence: [
    {
      gap: "The bundle lacks any data on corporate fines from the current decade.",
      how_to_close: "Ask the founder for recent examples of clients upgrading their ITAD protocols.",
    },
  ],
  evidence_refs: [
    {
      excerpt: "AT&T received a massive fine of $52M in 2014 for illegal e-waste disposal",
      supports: "Provides the baseline for corporate liability.",
      source_id: "page:https://allgreenrecycling.com/6-reasons",
      source_kind: "page",
    },
  ],
} as unknown as StoryAngle;

test("every entry the Story Engine writes is read, none dropped as malformed", () => {
  const read = readLadder(angle);
  expect(read.malformed).toBe(0);
  expect(read.total).toBe(4);
});

test("requirements with no satisfied flag are owed, as the server's gate says", () => {
  const read = readLadder(angle);
  const labels = read.rungs.filter((r) => r.missing).map((r) => r.label);
  expect(labels).toEqual([
    "Recent enforcement data",
    "Expert commentary on current corporate behavior",
    "The bundle lacks any data on corporate fines from the current decade.",
  ]);
  expect(read.held).toBe(1);
});

test("a gap carries the analyst's own path to close it", () => {
  const gap = readLadder(angle).rungs.find((r) => r.label.startsWith("The bundle lacks"));
  expect(gap?.missing?.how_to_get).toBe(
    "Ask the founder for recent examples of clients upgrading their ITAD protocols.",
  );
});

test("cited evidence reads with what it supports and a working link", () => {
  const ref = readLadder(angle).rungs.find((r) => r.evidence)?.evidence;
  expect(ref?.label).toBe("Provides the baseline for corporate liability.");
  expect(ref?.url).toBe("https://allgreenrecycling.com/6-reasons");
});

test("the hold keys agree with the reader's keys (one list of spellings, not two)", () => {
  expect(readEntryKeys(angle.proof_required, "proof")).toEqual(["proof_0", "proof_1"]);
  expect(readEntryKeys(angle.missing_evidence, "missing")).toEqual(["missing_0"]);
});
