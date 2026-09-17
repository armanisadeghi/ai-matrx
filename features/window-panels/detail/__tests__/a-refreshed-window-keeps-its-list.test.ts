// 🚨 NEW-15 (VERIFY-U-P1-R3) — A REFRESHED DETAIL WINDOW KEEPS THE LIST IT WAS
// OPENED FROM.
//
// Reproduced at `e64a912f`: the window's deep-link token carried `as` and
// nothing else (`urlSyncArgs={{ as: "window" }}`) and the hydrator passed
// `list: null`, so reloading with a detail window open silently lost the
// previous / next controls and the "3/40" counter. The page URL already knows
// how to carry a list; the panel token now carries it the same way, under the
// same cap.
//
// The token's own grammar is the constraint: `?panels=` splits tokens on `,`,
// the args off on `:`, arg pairs on `_` and each pair on `-`. A uuid is full of
// hyphens, so the value is escaped into a form that holds none of those four.

import {
  detailListToUrlArgs,
  finalPanelUrlLength,
  detailListFromUrlArgs,
  encodePanelArgValue,
  decodePanelArgValue,
} from "@/lib/detail/presentation";
import { parseParams, serializeParams } from "../../url-sync/UrlPanelManager";
import { DETAIL_URL_BUDGET_BYTES } from "@/lib/detail/types";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "file",
    id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
  }));

describe("the panel token's arg escaping", () => {
  it("holds none of the four characters the token grammar owns", () => {
    const encoded = encodePanelArgValue("file.11111111-2222-3333-4444-555555555555,note.a_b:c");
    expect(encoded).not.toMatch(/[,:_-]/);
    expect(decodePanelArgValue(encoded)).toBe(
      "file.11111111-2222-3333-4444-555555555555,note.a_b:c",
    );
  });
});

describe("the window's deep link", () => {
  it("carries the list, the index and the trim", () => {
    const args = detailListToUrlArgs({ items: refs(40), index: 3 }, 200);
    const back = detailListFromUrlArgs(args);
    expect(back?.items).toHaveLength(40);
    expect(back?.index).toBe(3);
    expect(back?.trimmedFrom).toBeUndefined();

    const trimmedArgs = detailListToUrlArgs({ items: refs(500), index: 250 }, 20);
    const trimmed = detailListFromUrlArgs(trimmedArgs);
    expect(trimmed?.items).toHaveLength(20);
    expect(trimmed?.trimmedFrom).toBe(500);
    expect(trimmed?.items[trimmed.index].id).toBe(refs(500)[250].id);
  });

  it("carries no list args at all when there is no list", () => {
    expect(detailListToUrlArgs(null, 200)).toEqual({});
    expect(detailListFromUrlArgs({})).toBeNull();
    expect(detailListFromUrlArgs({ as: "window" })).toBeNull();
  });

  it("survives the ?panels= round trip intact, uuids and all", () => {
    const args = { as: "window", ...detailListToUrlArgs({ items: refs(12), index: 5 }, 200) };
    const param = serializeParams({
      "detail:file.x": { typeKey: "detail", instanceId: "file.abc", args },
    });
    const [token] = parseParams(param);
    expect(token.args?.as).toBe("window");
    const back = detailListFromUrlArgs(token.args ?? {});
    expect(back?.items).toHaveLength(12);
    expect(back?.items[5].id).toBe(refs(12)[5].id);
    expect(back?.index).toBe(5);
  });

  it("stays inside the same budget the page URL obeys — measured on the FINAL address", () => {
    // 🚨 NEW-19 (VERIFY-U-P1-R4): the token's own escaping is not the last one.
    // `UrlPanelManager` writes the whole value through `URLSearchParams`, which
    // escapes every `%` again, so the budget is checked on what the browser
    // really carries.
    const args = detailListToUrlArgs({ items: refs(5000), index: 2500 }, 5000, {
      reservedBytes: "/dashboard".length,
    });
    expect(
      finalPanelUrlLength("/dashboard", "detail:file.x:as-window", args),
    ).toBeLessThanOrEqual(DETAIL_URL_BUDGET_BYTES);
    expect(detailListFromUrlArgs(args)?.trimmedFrom).toBe(5000);
  });
});
