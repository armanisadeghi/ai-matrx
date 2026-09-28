/**
 * The Transcripts view redesign (2026-09-27, Arman: "breaks every ui rule we
 * have"): a preset's own filters are the view, never removable chips — the
 * page showed "Transcript ×  Processed document ×  Transcript ×" over every
 * list — and "Clear filters" returns to the view, never to everything. A
 * transcript row's meta line says only facts the record carries.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { HubSearchBox } from "@/features/knowledge/hub/components/HubSearchBox";
import type { KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import { transcriptRowFacts } from "@/features/knowledge/hub/transcripts/transcriptRows";
import { oneKind } from "@/features/knowledge/hub/components/HubResults";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";

const PRESET: KnowledgeQuery = { mode: "find", types: ["transcript", "processed_document"], source_kinds: ["transcript"] };

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

function render(query: KnowledgeQuery, viewQuery: KnowledgeQuery | undefined, onQueryChange = jest.fn()) {
  act(() =>
    root.render(
      <HubSearchBox
        query={query}
        viewQuery={viewQuery}
        onQueryChange={onQueryChange}
        onOpenFilters={() => undefined}
        titleFor={(r) => r.name ?? r.type}
        onEnterResults={() => undefined}
      />,
    ),
  );
  return onQueryChange;
}

const chipLabels = () =>
  [...host.querySelectorAll('[aria-label="Active filters"] > span')].map((c) => c.textContent?.trim());

it("never shows the view's own filters as chips", () => {
  render(PRESET, PRESET);
  expect(host.querySelector('[aria-label="Active filters"]')).toBeNull();
  expect(host.textContent).not.toContain("Processed document");
});

it("shows only what the person added on top, and Clear filters returns to the view", () => {
  const onChange = render({ ...PRESET, captured_by: "me" }, PRESET);
  expect(chipLabels()).toEqual(["Captured by me"]);
  const clear = [...host.querySelectorAll("button")].find((b) => b.textContent === "Clear filters")!;
  act(() => clear.click());
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining(PRESET), { typing: false });
  expect(onChange.mock.calls.at(-1)[0].captured_by).toBeUndefined();
});

it("with no view query (a saved view, Everything) every filter stays a chip", () => {
  render(PRESET, undefined);
  expect(chipLabels()).toHaveLength(3);
});

const row = (over: Partial<TranscriptListRow>): TranscriptListRow =>
  ({ kind: "transcript", duration_seconds: null, word_count: null, is_draft: false, status: "", ...over }) as TranscriptListRow;

it("a transcript row says its duration, words and draft state — and nothing it does not know", () => {
  expect(transcriptRowFacts(row({ duration_seconds: 754, word_count: 2340, is_draft: true }))).toEqual([
    "13 min",
    "2,340 words",
    "Draft",
  ]);
  expect(transcriptRowFacts(row({}))).toEqual([]);
  expect(transcriptRowFacts(row({ duration_seconds: 0, word_count: 0 }))).toEqual([]);
  expect(transcriptRowFacts(undefined)).toEqual([]);
  expect(transcriptRowFacts(row({ kind: "session", status: "recording", duration_seconds: 3725 }))).toEqual([
    "Session",
    "1h 2m",
    "Recording",
  ]);
});

it("the kind word is dropped only when every row is the same kind", () => {
  const t = { entity: "processed_document", id: "a", title: "A", source_kind: "transcript" };
  const n = { entity: "note", id: "b", title: "B" };
  expect(oneKind([t, { ...t, id: "c" }])).toBe(true);
  expect(oneKind([t, n])).toBe(false);
  expect(oneKind([t])).toBe(false);
});
