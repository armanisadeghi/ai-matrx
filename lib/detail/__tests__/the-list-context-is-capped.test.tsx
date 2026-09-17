// 🚨 NEW-7 (VERIFY-U-P1-R2) — THE LIST A RECORD WAS OPENED FROM DOES NOT RIDE
// THE URL UNCAPPED.
//
// Reproduced: a 500-row list opened as a page put every `type.id` in the query
// string — a href over 20 KB, past every practical request-line limit, and
// nothing in the primitive bounded it. A page that cannot load is not a
// presentation.
//
// The cap is a knob (`ui.detail.list_context_max_ids`, default 200,
// org-overridable) because it is a ceiling, and every ceiling here is a knob an
// admin owns. Beyond it the URL carries the WINDOW around the current record —
// the neighbours the arrows can actually reach — and the detail SAYS the list
// was trimmed rather than quietly pretending the list was that short.

import * as React from "react";

import { DetailActions, DetailRecordMeta } from "../core/DetailHeader";
import { useDetailCore } from "../core/useDetailCore";
import { trimListContext } from "../listContext";
import {
  decodeListQuery,
  encodeListQuery,
} from "@/features/window-panels/detail/detailOverlayData";
import { instance, makePorts, mount } from "./harness";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

describe("trimListContext", () => {
  it("leaves a list inside the cap exactly as it is", () => {
    const list = { items: refs(10), index: 3 };
    expect(trimListContext(list, 200)).toEqual({ items: list.items, index: 3 });
  });

  it("keeps the window around the current record, and says what it trimmed", () => {
    const trimmed = trimListContext({ items: refs(500), index: 250 }, 10);
    expect(trimmed?.items).toHaveLength(10);
    expect(trimmed?.trimmedFrom).toBe(500);
    // The current record is still the one being shown, and it still has
    // neighbours on both sides.
    expect(trimmed?.items[trimmed.index].id).toBe(refs(500)[250].id);
    expect(trimmed?.index).toBeGreaterThan(0);
    expect(trimmed?.index).toBeLessThan(9);
  });

  it("clamps the window at both ends rather than running off them", () => {
    const first = trimListContext({ items: refs(500), index: 0 }, 10);
    expect(first?.index).toBe(0);
    expect(first?.items[0].id).toBe(refs(500)[0].id);

    const last = trimListContext({ items: refs(500), index: 499 }, 10);
    expect(last?.index).toBe(9);
    expect(last?.items[9].id).toBe(refs(500)[499].id);
  });
});

describe("the page href", () => {
  it("stops growing with the list, and stays a href a server will accept", () => {
    const query = encodeListQuery({ items: refs(500), index: 250 }, 200);
    // The invariant: the href is bounded by the KNOB, not by the list. A 500-row
    // and a 5000-row list produce the same length; uncapped, 500 rows was >20 KB.
    // (The only difference between the two is the digits of `lt`.)
    const bigger = encodeListQuery({ items: refs(5000), index: 250 }, 200);
    expect(bigger.length - query.length).toBeLessThan(3);
    expect(query.length).toBeLessThan(9000);
    const decoded = decodeListQuery(
      new URLSearchParams(query).get("l"),
      new URLSearchParams(query).get("i"),
      new URLSearchParams(query).get("lt"),
    );
    expect(decoded?.items).toHaveLength(200);
    expect(decoded?.trimmedFrom).toBe(500);
    expect(decoded?.items[decoded.index].id).toBe(refs(500)[250].id);
  });

  it("carries no trimmed marker when nothing was trimmed", () => {
    const query = encodeListQuery({ items: refs(3), index: 1 }, 200);
    expect(query).not.toContain("lt=");
    expect(decodeListQuery(new URLSearchParams(query).get("l"), "1", null)?.trimmedFrom).toBeUndefined();
  });
});

describe("the detail says the list was trimmed", () => {
  function Bar({ trimmedFrom }: { trimmedFrom?: number }) {
    const core = useDetailCore(
      instance({ list: { items: refs(5), index: 2, trimmedFrom } }),
      "page",
      {},
    );
    return (
      <div>
        <DetailActions core={core} />
        <DetailRecordMeta core={core} />
      </div>
    );
  }

  it("names the whole list and the part that is reachable", () => {
    const m = mount(<Bar trimmedFrom={500} />, makePorts());
    const note = m.container.querySelector("[data-detail-list-trimmed]");
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain("500");
    expect(note?.textContent).toContain("5");
    m.unmount();
  });

  it("says nothing when the whole list came along", () => {
    const m = mount(<Bar />, makePorts());
    expect(m.container.querySelector("[data-detail-list-trimmed]")).toBeNull();
    m.unmount();
  });
});
