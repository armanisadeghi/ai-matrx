// 🚨 NEW-13 (VERIFY-U-P1-R3) — "THE LIST WAS TRIMMED" SURVIVES LEAVING THE PAGE.
//
// Reproduced at `e64a912f`: `trimmedFrom` is set by `decodeListQuery`, rendered
// by `DetailRecordMeta`, and then DROPPED by the overlay payload
// (`listItems` / `listIndex` only). Switch a trimmed page to a window or a
// docked panel — or take the Undo that reopens a replaced record — and the
// surface presents 200 records as the whole list, silently. Two fields.

import { readDetailOverlayData, toDetailInstanceData } from "../detailOverlayData";
import { decodeListQuery, encodeListQuery } from "@/lib/detail/presentation";
import { overlayPayloadForDetail } from "../openDetailSingleton";
import type { DetailInstanceData } from "@/lib/detail/types";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

function roundTrip(data: DetailInstanceData): DetailInstanceData {
  const payload = overlayPayloadForDetail(data) as Record<string, unknown>;
  const parsed = readDetailOverlayData(payload);
  if (!parsed) throw new Error("the payload no longer names a record");
  return toDetailInstanceData(parsed);
}

const TRIMMED: DetailInstanceData = {
  type: "file",
  id: refs(3)[1].id,
  seed: null,
  list: { items: refs(3), index: 1, trimmedFrom: 500 },
};

describe("the overlay payload", () => {
  it("carries the trim into the window and the docked panel", () => {
    expect(roundTrip(TRIMMED).list?.trimmedFrom).toBe(500);
  });

  it("says nothing about a trim that did not happen", () => {
    const whole = { ...TRIMMED, list: { items: refs(3), index: 1 } };
    expect(roundTrip(whole).list?.trimmedFrom).toBeUndefined();
  });

  it("survives the Undo re-open, which is the same payload again", () => {
    expect(roundTrip(roundTrip(TRIMMED)).list?.trimmedFrom).toBe(500);
  });

  it("ignores a trim smaller than the list it claims to have cut", () => {
    const lying = { ...TRIMMED, list: { items: refs(3), index: 1, trimmedFrom: 2 } };
    expect(roundTrip(lying).list?.trimmedFrom).toBeUndefined();
  });
});

describe("the page query and the payload agree", () => {
  it("a trimmed page URL rebuilt into a window keeps the same sentence's numbers", () => {
    const query = encodeListQuery({ items: refs(500), index: 250 }, 20);
    const params = new URLSearchParams(query);
    const fromUrl = decodeListQuery(params.get("l"), params.get("i"), params.get("lt"));
    const data: DetailInstanceData = {
      type: "file",
      id: fromUrl!.items[fromUrl!.index].id,
      seed: null,
      list: fromUrl,
    };
    expect(roundTrip(data).list?.trimmedFrom).toBe(500);
    expect(roundTrip(data).list?.items).toHaveLength(fromUrl!.items.length);
  });
});
