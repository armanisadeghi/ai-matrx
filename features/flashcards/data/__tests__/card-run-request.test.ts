/**
 * A stopped card run is offered again with the SAME count and material
 * (V5-A.2): the request kept on the device round-trips to the exact Sources —
 * parts, form and limit — through the deck's own frozen shape.
 */
import { createSourceRef, type SourceSet } from "@ai-matrx/agents/sources";
import { cardRunRequest, restoreCardRunRequest } from "../cardRunRequest";

test("count, topic and the Sources as chosen survive the round trip", () => {
  const ref = createSourceRef("file", "f-1", { max_chars: 500 });
  const set = { version: 1, sources: [ref] } as unknown as SourceSet;
  const stored = JSON.parse(
    JSON.stringify(cardRunRequest(3, set, { "file:f-1": { label: "Ch 4.pdf", kind: "files" } }, "")),
  ) as Record<string, unknown>;
  const back = restoreCardRunRequest(stored);
  expect(back?.count).toBe(3);
  expect(back?.drafts).toHaveLength(1);
  expect(back?.drafts[0]!.ref).toEqual(ref);
  expect(back?.drafts[0]!.fileId).toBe("f-1");
});

test("a request with no count, or nothing to make cards from, is not offered", () => {
  expect(restoreCardRunRequest({ topic: "x" })).toBeNull();
  expect(restoreCardRunRequest({ count: 3, topic: "  " })).toBeNull();
  expect(restoreCardRunRequest({ count: 3, topic: "Osmosis" })?.topic).toBe("Osmosis");
});
