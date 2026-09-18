// 🚨 NEW-18 (VERIFY-U-P1-R4) — THE TRIMMED-LIST SENTENCE SURVIVES THE ARROWS.
//
// Reproduced at `01566c21`: `openNeighbour` rebuilt the list as
// `{ items, index: index + delta }` and dropped `trimmedFrom`, so the FIRST
// arrow press turned "stepping through 139 of the 500 records in the list this
// was opened from" into silence — in the window (`host.open` payload) and on the
// page (the `?lt=` the href builder writes from the list it is handed). The
// arrows are the primary binding, so the honesty NEW-7 and NEW-13 bought lasted
// exactly one keystroke.
//
// The builders' own guard (`the-trim-travels-with-the-record.test.ts`) tests the
// payload ROUND TRIP only, which is why it could not see this. This one drives
// the arrows.

import * as React from "react";

import { DetailActions, DetailRecordMeta } from "../core/DetailHeader";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailPresentation } from "../types";
import { clickByLabel, instance, makePorts, mount } from "./harness";

const TRIMMED_FROM = 500;

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

function Detail({
  presentation,
  index,
}: {
  presentation: DetailPresentation;
  index: number;
}) {
  const items = refs(139);
  const core = useDetailCore(
    instance({ id: items[index].id, list: { items, index, trimmedFrom: TRIMMED_FROM } }),
    presentation,
    { onClose: () => {} },
  );
  return (
    <div>
      <DetailActions core={core} />
      <DetailRecordMeta core={core} />
    </div>
  );
}

describe("arrowing inside a list that was trimmed to fit a URL", () => {
  it("says so before the arrow, on the record the person is looking at", () => {
    const ports = makePorts();
    const m = mount(<Detail presentation="window" index={70} />, ports);
    const said = m.container.querySelector("[data-detail-list-trimmed]")?.textContent ?? "";
    expect(said).toContain("139");
    expect(said).toContain("500");
    m.unmount();
  });

  it("carries the whole list context into the next record in the window", () => {
    const ports = makePorts();
    const m = mount(<Detail presentation="window" index={70} />, ports);
    clickByLabel(m.container, "Next record (Down arrow, or right bracket)");
    const open = ports.open as jest.Mock;
    expect(open).toHaveBeenCalledTimes(1);
    const { data } = open.mock.calls[0][0];
    expect(data.list.index).toBe(71);
    expect(data.list.items).toHaveLength(139);
    expect(data.list.trimmedFrom).toBe(TRIMMED_FROM);
    m.unmount();
  });

  it("carries it into the previous record too", () => {
    const ports = makePorts();
    const m = mount(<Detail presentation="window" index={70} />, ports);
    clickByLabel(m.container, "Previous record (Up arrow, or left bracket)");
    const { data } = (ports.open as jest.Mock).mock.calls[0][0];
    expect(data.list.trimmedFrom).toBe(TRIMMED_FROM);
    m.unmount();
  });

  it("carries it into the page navigation, which is where `lt=` comes from", () => {
    const ports = makePorts();
    const m = mount(<Detail presentation="page" index={70} />, ports);
    clickByLabel(m.container, "Next record (Down arrow, or right bracket)");
    const [, extra] = (ports.navigate.toPage as jest.Mock).mock.calls[0];
    expect(extra.list.index).toBe(71);
    expect(extra.list.trimmedFrom).toBe(TRIMMED_FROM);
    m.unmount();
  });
});
