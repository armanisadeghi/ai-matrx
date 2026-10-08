/**
 * After a refresh mid-batch the saved request id is the BATCH's. The doc's own
 * child run (its by-link run) must drive status; the saved id is only a replay
 * handle while the doc has no run of its own.
 */
import { choosePdfRunTarget } from "../usePdfDocRun";

const DOC = "8a1f0c2e-6b7d-4e5f-9a0b-1c2d3e4f5a6b";
const batch = { requestId: "batch-req", kind: "upload" as const, at: 1 };
const clean = { requestId: "clean-req", kind: "clean" as const, at: 1 };
const link = { linkKind: "processed_document", linkId: DOC };

it("follows the doc's own run when it exists, even with a saved batch id", () => {
  expect(choosePdfRunTarget(DOC, batch, 1)).toEqual(link);
});
it("replays the saved batch id only when the doc has no run yet", () => {
  expect(choosePdfRunTarget(DOC, batch, 0)).toEqual({ requestId: "batch-req" });
});
it("waits for the lookup before choosing for a saved upload", () => {
  expect(choosePdfRunTarget(DOC, batch, null)).toBeNull();
});
it("follows a saved AI clean directly and the link when nothing is saved", () => {
  expect(choosePdfRunTarget(DOC, clean, null)).toEqual({ requestId: "clean-req" });
  expect(choosePdfRunTarget(DOC, null, 0)).toEqual(link);
  expect(choosePdfRunTarget(null, batch, 1)).toBeNull();
});
