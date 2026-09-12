/**
 * THE LEDGER DECIDES WHICH DISCLOSURE IS LATEST (Bugbot, PR #222, 2026-09-12).
 *
 * `readCaseDisclosures` concatenates live emissions first and stored node
 * outputs last. That order is arrival-by-SOURCE, not recency: a run holding a
 * fresh emission for turn 5 and a stored output for turn 2 handed the old
 * behaviour the OLDER row last, and the run box drew an earlier cumulative
 * ledger — hiding steps the case had already released to the desk.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — going back to `disclosures[disclosures.length - 1]`;
 *  · second — ranking by something other than the ledger (the tie case, which
 *    is the only place array position may still decide).
 */
import {
  latestCaseDisclosure,
  readCaseDisclosures,
} from "./caseDisclosures";
import { CASE_DISCLOSURE_KIND } from "@/features/content-ir/kinds/masterwork-unfolding";
import type { WorkflowRunEmission } from "@/features/workflow-runtime/redux/workflow-runs.slice";

const disclosure = (steps: number, note: string) => ({
  __kind: CASE_DISCLOSURE_KIND,
  disclosed: [note],
  available: true,
  ledger: { steps, cost: steps, risk: 0, requests: [] },
});

const emission = (payload: Record<string, unknown>): WorkflowRunEmission =>
  ({ nodeId: "oracle", payload }) as unknown as WorkflowRunEmission;

it("renders the FURTHEST-ALONG ledger even when an older stored output arrives last", () => {
  const live = disclosure(5, "The CT came back clean.");
  const stored = disclosure(2, "She reported the headache.");

  const rows = readCaseDisclosures({
    nodeId: "oracle",
    emissions: [emission(live)],
    invocations: [{ output: stored }],
  });
  // The reader still hands both over in source order — that is its contract.
  expect(rows).toEqual([live, stored]);
  expect(latestCaseDisclosure(rows)).toBe(live);
});

it("takes the later row when two disclosures report the same step", () => {
  const first = disclosure(3, "first copy");
  const second = disclosure(3, "second copy");
  expect(latestCaseDisclosure([first, second])).toBe(second);
  // And a run with no ledgers at all keeps the old last-wins behaviour.
  const bare = { __kind: CASE_DISCLOSURE_KIND, disclosed: [], available: true };
  const bare2 = { __kind: CASE_DISCLOSURE_KIND, disclosed: ["x"], available: true };
  expect(latestCaseDisclosure([bare, bare2])).toBe(bare2);
  expect(latestCaseDisclosure([])).toBeNull();
});
