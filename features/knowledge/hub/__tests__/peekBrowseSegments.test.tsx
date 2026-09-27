/** @jest-environment jsdom */
/**
 * The peek's segments while BROWSING (no search term) are the Source's own
 * first Segments, read from the Source — never the search's `top_segments`,
 * which are passages that matched words nobody typed (live walk, 2026-09-27).
 * With a search term, the matched passages stay.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = new URLSearchParams("");
jest.mock("next/navigation", () => ({ useSearchParams: () => search }));
jest.mock("@ai-matrx/associations/react", () => ({
  useEntityTitles: () => ({ titleFor: () => "Untitled", isUnresolved: () => false, loading: false }),
  useAssociations: () => ({ edges: [], status: "ready", error: null }),
}));
const fetchDocumentChunks = jest.fn();
jest.mock("@/features/rag/api/document", () => ({
  fetchDocumentChunks: (...a: unknown[]) => fetchDocumentChunks(...a),
}));

import { HubPeek } from "../components/HubPeek";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

const hit: KnowledgeHit = {
  entity: "processed_document",
  id: "src-1",
  title: "NSF solicitation",
  top_segments: [{ id: "g1", text: "A passage the search ranked", locator: "p. 7" }],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  fetchDocumentChunks.mockReset();
  fetchDocumentChunks.mockResolvedValue([
    { chunk_id: "c2", chunk_index: 1, chunk_kind: "text", content_text: "Second chunk of the Source", page_numbers: [1] },
    { chunk_id: "c1", chunk_index: 0, chunk_kind: "text", content_text: "Opening chunk of the Source", page_numbers: [1] },
  ]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(
      <HubPeek
        hit={hit}
        peekKey="processed_document:src-1"
        sample={false}
        onClose={jest.fn()}
        onOpenFull={jest.fn()}
        onFileUnder={jest.fn()}
        onAcceptSuggestion={jest.fn()}
      />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

it("browsing: shows the Source's own first Segments in order, read from the Source", async () => {
  search = new URLSearchParams("");
  await render();
  expect(fetchDocumentChunks).toHaveBeenCalledWith("src-1", expect.objectContaining({ limit: 3 }));
  const text = container.textContent ?? "";
  expect(text).toContain("First segments");
  expect(text.indexOf("Opening chunk")).toBeLessThan(text.indexOf("Second chunk"));
  expect(text).not.toContain("A passage the search ranked");
});

it("searching: shows the passages the search matched", async () => {
  search = new URLSearchParams("q=solicitation");
  await render();
  expect(fetchDocumentChunks).not.toHaveBeenCalled();
  expect(container.textContent).toContain("A passage the search ranked");
});
