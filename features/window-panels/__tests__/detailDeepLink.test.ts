/**
 * The Detail primitive's deep link must ROUND-TRIP through the ONE panel URL
 * mechanism: the token the shells write (`useUrlSync` / `WindowPanel` urlSync
 * props) is the token `UrlPanelManager` parses and the `detail` hydrator opens.
 * The 2026-08-30 class: an app that writes a `?panels=` token it cannot read
 * back (NotesWindow's `notes-default:default`). This pins both directions and
 * the page route's list query.
 */

import { configureStore } from "@reduxjs/toolkit";

import overlays, { selectOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  DETAIL_URL_AS_ARG,
  DETAIL_URL_TYPE_KEY,
  detailInstanceKey,
  decodeListQuery,
  encodeListQuery,
  parseDetailInstanceKey,
  presentationFromUrlArg,
} from "@ai-matrx/detail";
import { readDetailOverlayData, toDetailInstanceData } from "../detail/detailOverlayData";
import { parseParams, serializeParams } from "../url-sync/UrlPanelManager";
import { initUrlHydration } from "../url-sync/initUrlHydration";
import { getHydrator } from "../url-sync/UrlPanelRegistry";

const REF = { type: "task", id: "0f0a2a2e-5b8e-4a11-9c8f-1d2e3f4a5b6c" };

describe("detail deep link", () => {
  beforeAll(() => {
    initUrlHydration();
  });

  it("writes a ?panels= token the manager parses back to the same record and presentation", () => {
    const entries = {
      [`${DETAIL_URL_TYPE_KEY}:${detailInstanceKey(REF)}`]: {
        typeKey: DETAIL_URL_TYPE_KEY,
        instanceId: detailInstanceKey(REF),
        args: { [DETAIL_URL_AS_ARG]: "docked" },
      },
    };
    const written = serializeParams(entries);
    expect(written).toBe(`detail:task.${REF.id}:as-docked`);

    const [parsed] = parseParams(written);
    expect(parsed.typeKey).toBe("detail");
    expect(parseDetailInstanceKey(parsed.instanceId)).toEqual(REF);
    expect(presentationFromUrlArg(parsed.args?.[DETAIL_URL_AS_ARG])).toBe("docked");
  });

  // The hydrator goes through `openDetailSingleton` (D8), so what is asserted is
  // the STATE it leaves behind, not the action it dispatched — a stronger claim
  // than the old one, which matched a literal payload and would have passed with
  // the announcement missing.
  it("hydrates the window by default and the docked panel on as-docked", () => {
    const hydrator = getHydrator("detail");
    expect(hydrator).toBeDefined();

    const store = configureStore({ reducer: { overlays } });
    hydrator?.(store.dispatch as never, detailInstanceKey(REF), {});
    const windowInstance = selectOverlay(store.getState(), "detailWindow");
    expect(windowInstance.isOpen).toBe(true);
    expect(windowInstance.data).toEqual({
      type: REF.type,
      id: REF.id,
      seedName: null,
      seedAbout: null,
      listItems: null,
      listIndex: null,
      // NEW-13: the trim travels with the record, so the payload always names it.
      listTrimmedFrom: null,
    });

    const docked = configureStore({ reducer: { overlays } });
    hydrator?.(docked.dispatch as never, detailInstanceKey(REF), { as: "docked" });
    expect(selectOverlay(docked.getState(), "detailDocked").isOpen).toBe(true);
    expect(selectOverlay(docked.getState(), "detailWindow").isOpen).toBe(false);
  });

  it("refuses a token that names no record instead of opening an empty detail", () => {
    const hydrator = getHydrator("detail");
    const dispatch = jest.fn();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    hydrator?.(dispatch as never, "not-a-record", {});
    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("round-trips the overlay payload and the page list query", () => {
    const list = { items: [REF, { type: "task", id: "b" }, { type: "note", id: "c" }], index: 1 };
    const data = readDetailOverlayData({
      type: REF.type,
      id: REF.id,
      seedName: "A task",
      seedAbout: null,
      listItems: list.items,
      listIndex: list.index,
    });
    expect(data).not.toBeNull();
    expect(toDetailInstanceData(data!)).toEqual({
      type: REF.type,
      id: REF.id,
      seed: { name: "A task", about: null },
      list,
    });

    const query = encodeListQuery(list);
    const params = new URLSearchParams(query);
    expect(decodeListQuery(params.get("l"), params.get("i"), params.get("lt"))).toEqual(list);
    expect(decodeListQuery(null, null)).toBeNull();
  });
});
