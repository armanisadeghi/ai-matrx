/**
 * A save under latency never loses what the person typed (verify-RC-B4 R6-4).
 *
 * Replays the observed shape: the person types, presses Save, keeps typing while
 * the slow save is in flight; the host then re-sends `value` = the text that
 * was saved. The editor must keep the later typing — and the next save must
 * carry it.
 */
import { reconcileHostValue } from "../core/host-value";

const ORIGINAL = "Tonight's handover: drain the print queue.";
const TYPED = "Tonight's handover: drain the print queue. Swap the label printer.";
const TYPED_MORE = `${TYPED} Re-scan bay B3.`;

it("the host echoing the in-flight save while the person keeps typing keeps the later typing", () => {
  const ownSaves = new Set([TYPED]); // Save pressed with TYPED; still in flight
  // The person typed more; the host re-sends the saved text before the save settles.
  expect(reconcileHostValue({ value: TYPED, lastValue: ORIGINAL, stored: ORIGINAL, draft: TYPED_MORE, ownSaves })).toBe("adopt-stored");
});

it("a host value the editor never saved, arriving over unsaved edits, keeps the draft (and the person is told)", () => {
  expect(reconcileHostValue({ value: "someone else's text", lastValue: ORIGINAL, stored: ORIGINAL, draft: TYPED, ownSaves: new Set() })).toBe("keep-draft");
});

it("a new document over a clean editor opens", () => {
  expect(reconcileHostValue({ value: "another note", lastValue: ORIGINAL, stored: ORIGINAL, draft: ORIGINAL, ownSaves: new Set() })).toBe("reset");
});

it("the same value again does nothing", () => {
  expect(reconcileHostValue({ value: ORIGINAL, lastValue: ORIGINAL, stored: ORIGINAL, draft: TYPED, ownSaves: new Set() })).toBe("ignore");
});
