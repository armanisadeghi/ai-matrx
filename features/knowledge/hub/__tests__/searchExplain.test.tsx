/**
 * The hub explains its own search the way the Search Lab does (Arman, 2026-09-29): a quiet line
 * over the results ("25 hits · 131 candidates · reranked · 'perceive' 0, 'acceleration' 24"), a
 * "Why matched" reveal under each passage, and a "How search works" panel behind a `?`. The real
 * pieces run; only the search result is supplied.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SearchExplainHeader, WhyMatchedPopover } from "@/features/knowledge/hub/components/HubSearchExplain";
import { HowSearchWorksContent } from "@/features/knowledge/hub/components/HubHowSearchWorks";
import { HUB_PRESETS } from "@/features/knowledge/hub/hubSavedViews";
import { termCoverage, whyMatched } from "@/features/rag/components/search/searchExplain";
import type { KnowledgeHit, KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function seg(id: string, snippet: string, extra: Partial<KnowledgeHit> = {}): KnowledgeHit {
  return { entity: "segment", id, title: "Doc", snippet, ...extra };
}
function ready(key: SectionState["key"], section: Partial<KnowledgeSection>): SectionState {
  return {
    key,
    status: "ready",
    loadingMore: false,
    moreError: null,
    section: { key, label: key, count: null, items: [], next_cursor: null, ...section },
  };
}

it("the header says hits, candidates, reranked and how many passages hold each typed word", () => {
  const items = [seg("a", "acceleration of the body"), seg("b", "acceleration again"), seg("c", "nothing here")];
  act(() =>
    root.render(
      <SearchExplainHeader
        text="perceive acceleration"
        sections={[ready("segments", { count: 131, items, reranker_model: "rerank-v4" })]}
      />,
    ),
  );
  expect(host.textContent).toBe("3 hits · 131 candidates · reranked · 'perceive' 0, 'acceleration' 2");
});

it("says when the rerank did not apply, and stays silent with no words or no answer", () => {
  act(() =>
    root.render(
      <SearchExplainHeader
        text="perceive acceleration"
        sections={[ready("segments", { count: 9, items: [seg("a", "x")], rerank_status: "timeout" })]}
      />,
    ),
  );
  expect(host.textContent).toContain("rerank skipped: slow");
  act(() => root.render(<SearchExplainHeader text="" sections={[ready("segments", { count: 1, items: [] })]} />));
  expect(host.textContent).toBe("");
  act(() =>
    root.render(
      <SearchExplainHeader
        text="a b"
        sections={[{ key: "segments", status: "loading", section: null, loadingMore: false, moreError: null }]}
      />,
    ),
  );
  expect(host.textContent).toBe("");
});

it("why matched names the words that landed, the lane that found it, and the relevance", () => {
  const f = whyMatched(
    { snippet: "acceleration of the body", vector_rank: 3, lexical_rank: null, rerank_score: 0.62 },
    "perceive acceleration",
  );
  expect(f.found).toEqual(["perceive", "acceleration"].filter((t) => t === "acceleration"));
  expect(f.absent).toEqual(["perceive"]);
  expect(f.lanes).toEqual(["by meaning (#3)"]);
  expect(f.relevance?.label).toBe("Strong match");
  expect(termCoverage("one", ["one"])).toBeNull();
});

it("the popover button is there for a passage row; its reveal is the lab's words", () => {
  const hit = seg("a", "acceleration of the body", { vector_rank: 2, lexical_rank: 1, rerank_score: 0.3 });
  act(() => root.render(<WhyMatchedPopover hit={hit} text="perceive acceleration" />));
  expect(host.querySelector("[data-testid=why-matched-toggle]")?.textContent).toBe("Why matched");
  act(() => root.render(<WhyMatchedPopover hit={hit} text="" />));
  expect(host.querySelector("[data-testid=why-matched-toggle]")).toBeNull();
});

it("the help panel carries the three retired explainers", () => {
  act(() => root.render(<HowSearchWorksContent />));
  const t = host.textContent ?? "";
  expect(t).toContain("Common workflows");
  expect(t).toContain("What is a data store?");
  expect(t).toContain("The Matrx Library");
  expect(t).toContain("A named, curated bucket of documents.");
});

it("the Transcripts preset says what the view lists: records and sessions, not transcript Sources", () => {
  const p = HUB_PRESETS.find((x) => x.key === "transcripts");
  expect(p?.query.types).toEqual(["transcript", "studio_session"]);
  expect(p?.query.source_kinds).toBeUndefined();
});
