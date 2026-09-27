/** @jest-environment jsdom */
/**
 * A Sources-only browse (types=processed_document) leaves the other sections
 * out on purpose. They are not part of this search — never "did not answer"
 * (live walk 2026-09-27: seven red errors on a Sources-only browse).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKnowledgeResults } from "../hooks/useKnowledgeResults";
import type { KnowledgeQuery, KnowledgeSearchRunner } from "@/features/knowledge/api/knowledgeSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sourcesOnly: KnowledgeSearchRunner = async (_q, options) => {
  const s = { key: "sources" as const, label: "Sources", count: 1, items: [{ entity: "processed_document", id: "s", title: "S" }], next_cursor: null };
  options?.onSection?.(s);
  return [s];
};

let seen: ReturnType<typeof useKnowledgeResults> | null = null;
function Probe({ query }: { query: KnowledgeQuery }) {
  seen = useKnowledgeResults(query, "live", sourcesOnly);
  return null;
}

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

async function run(query: KnowledgeQuery) {
  await act(async () => root.render(<Probe query={query} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return seen!;
}

it("a type-narrowed query shows no 'did not answer' for sections it left out", async () => {
  const r = await run({ mode: "find", types: ["processed_document"] });
  expect(r.sections.filter((s) => s.status === "error")).toEqual([]);
});

it("an open query still says a missing section did not answer", async () => {
  const r = await run({ mode: "find", text: "x" });
  expect(r.sections.find((s) => s.key === "chats")?.status).toBe("error");
});
