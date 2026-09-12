/**
 * THE RECORD CHANGE BUS — a save invalidates every SIBLING's count.
 *
 * The defect this guards (V-42 §3.1): after saving one block in a
 * conversation, a SECOND unsaved block of the same kind still read "Save this
 * as the first one" — false at the moment it was on screen, corrected only by a
 * full page reload. Before the bus existed there was nothing to subscribe to,
 * so the second strip had no way to learn. These assertions are the contract
 * the strips rely on.
 */

import {
  notifyKindRecordsChanged,
  subscribeToKindRecordChanges,
} from "@/features/content-ir/records/record-change-bus";

describe("record change bus", () => {
  it("reaches EVERY listener, not only the one that wrote", () => {
    const writer: (string | null)[] = [];
    const sibling: (string | null)[] = [];
    const offA = subscribeToKindRecordChanges((k) => writer.push(k));
    const offB = subscribeToKindRecordChanges((k) => sibling.push(k));

    notifyKindRecordsChanged("wine_tasting");

    expect(writer).toEqual(["wine_tasting"]);
    expect(sibling).toEqual(["wine_tasting"]);
    offA();
    offB();
  });

  it("a null kind means every listener must re-read", () => {
    const seen: (string | null)[] = [];
    const off = subscribeToKindRecordChanges((k) => seen.push(k));
    notifyKindRecordsChanged(null);
    expect(seen).toEqual([null]);
    off();
  });

  it("stops delivering once a listener unsubscribes", () => {
    const seen: (string | null)[] = [];
    const off = subscribeToKindRecordChanges((k) => seen.push(k));
    off();
    notifyKindRecordsChanged("wine_tasting");
    expect(seen).toEqual([]);
  });

  it("survives a listener that unsubscribes DURING delivery", () => {
    // A strip that unmounts on the same tick must not truncate the fan-out —
    // that would leave the remaining strips stale, which is the whole defect.
    const seen: string[] = [];
    const offSelf = subscribeToKindRecordChanges(() => {
      seen.push("first");
      offSelf();
    });
    const offOther = subscribeToKindRecordChanges(() => seen.push("second"));
    notifyKindRecordsChanged("wine_tasting");
    expect(seen).toEqual(["first", "second"]);
    offOther();
  });
});
