/**
 * THE SEALED CASE A DESK MAY BE STARTED ON (Bugbot, PR #222, 2026-09-12).
 *
 * The run box holds the chosen case in state, and state outlives a change of
 * Masterwork and a reload of the list. The start guard used to ask only "is an
 * id set?", so a stale id could start the NEXT desk against the PREVIOUS
 * Masterwork's case — a run against a case from another Rulebook, silently.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — going back to a truthy-id check, so an id off the list starts;
 *  · second — treating a list that is still loading (or that failed to load)
 *    as permission to send whatever id is in hand.
 */
import { chosenSealedCaseIsCurrent, findCaseDiscloseNodeId } from "./sealedCases";

const READY = {
  status: "ready" as const,
  cases: [
    { id: "case-a", label: "The first desk's case", published: "2019" },
    { id: "case-b", label: "The second desk's case", published: "2021" },
  ],
};

it("allows only a case the picker is currently offering", () => {
  expect(chosenSealedCaseIsCurrent("case-a", READY)).toBe(true);
  expect(chosenSealedCaseIsCurrent("case-b", READY)).toBe(true);
  // The previous desk's case, still in state after the box was re-pointed.
  expect(chosenSealedCaseIsCurrent("case-from-another-rulebook", READY)).toBe(
    false,
  );
  expect(chosenSealedCaseIsCurrent(null, READY)).toBe(false);
  expect(
    chosenSealedCaseIsCurrent("case-a", { status: "ready", cases: [] }),
  ).toBe(false);
});

it("refuses while the list is unknown — loading, idle, or failed", () => {
  expect(chosenSealedCaseIsCurrent("case-a", { status: "loading" })).toBe(false);
  expect(chosenSealedCaseIsCurrent("case-a", { status: "idle" })).toBe(false);
  expect(chosenSealedCaseIsCurrent("case-a", { status: "error" })).toBe(false);
});

it("still recognises a desk by its oracle node, under either shape", () => {
  expect(
    findCaseDiscloseNodeId({
      nodes: [{ id: "oracle", type: "masterwork.case.disclose" }],
    } as never),
  ).toBe("oracle");
  expect(
    findCaseDiscloseNodeId({
      nodes: [{ id: "oracle", data: { spec_type: "masterwork.case.disclose" } }],
    } as never),
  ).toBe("oracle");
  expect(findCaseDiscloseNodeId(null)).toBeNull();
});
