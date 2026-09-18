// 🚨 NEW-14 (VERIFY-U-P1-R3) — ARROWING BETWEEN RECORDS IS ONE HISTORY ENTRY.
//
// Reproduced at `e64a912f`: `openNeighbour` on the page presentation called
// `toPage`, which is `router.push`. Five presses of `]` produced five pushes, so
// twenty records meant twenty Backs — and the chevron labelled "Back" returned
// to the PREVIOUS RECORD rather than to the list the person came from. Linear
// and Gmail both replace rather than push when moving inside a list.
//
// The fix is at the port: moving to a neighbour REPLACES the entry that is
// showing the current record (naming it, so the exit's "did this tab push a
// detail page" answer travels with the visit), and `leave` is unchanged — one
// entry in, one Back out, to the list.

import * as React from "react";

import { DetailActions } from "../core/DetailHeader";
import { useDetailCore } from "../core/useDetailCore";
import { clickByLabel, instance, makePorts, mount } from "./harness";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

function PageBar({ index }: { index: number }) {
  const core = useDetailCore(
    instance({ id: refs(20)[index].id, list: { items: refs(20), index } }),
    "page",
    {},
  );
  return <DetailActions core={core} />;
}

describe("stepping through a list on the page presentation", () => {
  it("replaces the detail's own history entry instead of stacking one per record", () => {
    const ports = makePorts();
    const m = mount(<PageBar index={4} />, ports);
    clickByLabel(m.container, "Next record (Down arrow, or right bracket)");

    const toPage = ports.navigate.toPage as jest.Mock;
    expect(toPage).toHaveBeenCalledTimes(1);
    const [target, extra] = toPage.mock.calls[0];
    expect(target.id).toBe(refs(20)[5].id);
    // The record whose entry is being replaced is NAMED, so the host can carry
    // "this tab pushed a detail page" forward to the record now showing.
    expect(extra.replacing).toEqual({ type: "file", id: refs(20)[4].id });
    expect(extra.list.index).toBe(5);
    m.unmount();
  });

  it("does the same going backwards", () => {
    const ports = makePorts();
    const m = mount(<PageBar index={4} />, ports);
    clickByLabel(m.container, "Previous record (Up arrow, or left bracket)");
    const [, extra] = (ports.navigate.toPage as jest.Mock).mock.calls[0];
    expect(extra.replacing).toEqual({ type: "file", id: refs(20)[4].id });
    m.unmount();
  });

  it("still PUSHES when the page is being opened from another presentation", () => {
    const ports = makePorts();
    function WindowBar() {
      const core = useDetailCore(instance(), "window", { onClose: () => {} });
      return <DetailActions core={core} />;
    }
    const m = mount(<WindowBar />, ports);
    clickByLabel(m.container, "Open as page");
    const [, extra] = (ports.navigate.toPage as jest.Mock).mock.calls[0];
    expect(extra?.replacing ?? null).toBeNull();
    m.unmount();
  });
});
