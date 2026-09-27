/**
 * Segments stream twice on submit: the fused order as a `section`, then the reranked
 * order as a `section_update` that replaces it. An error after results keeps the
 * results on screen and carries the error.
 */
const postNdjson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postNdjson: (...a: unknown[]) => postNdjson(...a) }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({
  searchCandidatesAcrossTokens: jest.fn(),
}));

import { searchKnowledgeServer, type KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";

function stream(events: unknown[]) {
  return (async function* () {
    for (const e of events) yield e;
  })();
}
const data = (d: unknown) => ({ event: "data", data: d });
const hit = (id: string) => ({ entity: "segment", id, title: id });

beforeEach(() => postNdjson.mockReset());

test("a section_update replaces the fused Segments with the reranked order", async () => {
  postNdjson.mockReturnValue(
    stream([
      data({ type: "search_started", sections: ["segments", "messages"] }),
      data({ type: "section", section: "segments", count: 2, items: [hit("a"), hit("b")] }),
      data({ type: "section", section: "messages", count: 0, items: [] }),
      data({ type: "section_update", section: "segments", count: 2, items: [hit("b"), hit("a")] }),
      data({ type: "done" }),
    ]),
  );
  const seen: KnowledgeSection[] = [];
  const out = await searchKnowledgeServer({ text: "grant" }, { onSection: (s) => seen.push(s) });
  expect(seen.filter((s) => s.key === "segments").map((s) => s.items.map((i) => i.id))).toEqual([
    ["a", "b"],
    ["b", "a"],
  ]);
  expect(out.find((s) => s.key === "segments")?.items.map((i) => i.id)).toEqual(["b", "a"]);
  expect(out.find((s) => s.key === "messages")?.label).toBe("Messages");
});

test("an error after the fused order keeps the results and carries the error", async () => {
  postNdjson.mockReturnValue(
    stream([
      data({ type: "search_started", sections: ["segments"] }),
      data({ type: "section", section: "segments", count: 1, items: [hit("a")] }),
      data({ type: "section_error", section: "segments", message: "Reranking stopped. The fused order shown stands." }),
      data({ type: "done" }),
    ]),
  );
  const out = await searchKnowledgeServer({ text: "grant" });
  const seg = out.find((s) => s.key === "segments");
  expect(seg?.items.map((i) => i.id)).toEqual(["a"]);
  expect(seg?.error?.message).toContain("fused order shown stands");
});
