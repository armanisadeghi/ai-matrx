/**
 * AskPanel from the person's seat: the answer streams with numbered citations
 * that link to the Source at that Segment; a click goes to the host's peek;
 * a sentence with no citation says so; per-Source checkboxes reach the
 * request; and the honest states — no Sources in the filter, the monthly cap
 * — say what happened. The runners are the panel's own seams; the wire
 * adapter is exercised separately against real server-shaped lines.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AskPanel } from "@/features/knowledge/ask/AskPanel";
import {
  adaptAskEvent,
  citationHref,
  toAskRequest,
  tokenizeAnswer,
  type AskEvent,
  type AskRequest,
  type AskRunner,
} from "@/features/knowledge/ask/askKnowledge";
import type { KnowledgeHit, KnowledgeSearchRunner } from "@/features/knowledge/api/knowledgeSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCES: KnowledgeHit[] = [
  { entity: "processed_document", id: "doc-1", title: "Grant guide" },
  { entity: "processed_document", id: "doc-2", title: "Travel policy" },
];

const CITED: AskEvent[] = [
  { type: "ask_started", notes: [] },
  { type: "answer_delta", text: "The grant budget is 40k [1]. " },
  { type: "answer_delta", text: "Travel is covered [2]. Reviews are yearly." },
  {
    type: "citations",
    citations: [
      { number: 1, segment_id: "seg-a", source_id: "doc-1", source_title: "Grant guide", locator: "p. 3", quote: "The budget is 40k." },
      { number: 2, segment_id: "seg-b", source_id: "doc-2", source_title: "Travel policy", quote: "Travel is covered." },
    ],
    uncited_sentences: ["Reviews are yearly."],
  },
  {
    type: "sources_used",
    items: [
      { source_id: "doc-1", title: "Grant guide", on: true, segments: 1, cited: true },
      { source_id: "doc-2", title: "Travel policy", on: true, segments: 1, cited: true },
    ],
    note: null,
  },
  { type: "ask_done", answer: "The grant budget is 40k [1]. Travel is covered [2]. Reviews are yearly.", found: true, model: "m" },
];

function scripted(events: AskEvent[], seen?: AskRequest[]): AskRunner {
  return async (request, onEvent) => {
    seen?.push(request);
    for (const e of events) onEvent(e);
  };
}

const noSearch: KnowledgeSearchRunner = async () => {
  throw new Error("the panel must not search when the host passes sources");
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

async function clickAsk() {
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Ask");
  expect(button).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

test("inline citations render as numbered links to the Source at that Segment", async () => {
  await render(
    <AskPanel query={{ text: "what is the grant budget" }} sources={SOURCES} runAsk={scripted(CITED)} runSearch={noSearch} />,
  );
  await clickAsk();
  const answer = container.querySelector('[data-testid="ask-answer"]')!;
  const links = Array.from(answer.querySelectorAll("a"));
  expect(links.map((a) => a.textContent)).toEqual(["1", "2"]);
  expect(links[0].getAttribute("href")).toBe("/knowledge/sources/doc-1?chunk=seg-a");
  expect(links[1].getAttribute("href")).toBe("/knowledge/sources/doc-2?chunk=seg-b");
  expect(links[0].getAttribute("target")).toBe("_blank");
  // The sentence the server named as uncited says so in place; cited ones do not.
  expect(answer.textContent).toContain("Reviews are yearly.no citation");
  expect(answer.textContent!.match(/no citation/g)).toHaveLength(1);
  // The citation list names Source, locator and quote.
  const list = container.querySelector('ol[aria-label="Citations"]')!;
  expect(list.textContent).toContain("Grant guide");
  expect(list.textContent).toContain("p. 3");
  expect(list.textContent).toContain("The budget is 40k.");
});

test("a citation click opens it in the host's peek with the Segment address", async () => {
  const opened: [string, string][] = [];
  await render(
    <AskPanel
      query={{ text: "budget?" }}
      sources={SOURCES}
      runAsk={scripted(CITED)}
      runSearch={noSearch}
      onOpenCitation={(c, href) => opened.push([c.segment_id, href])}
    />,
  );
  await clickAsk();
  const first = container.querySelector('[data-testid="ask-answer"] a')!;
  await act(async () => {
    first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  expect(opened).toEqual([["seg-a", "/knowledge/sources/doc-1?chunk=seg-a"]]);
});

test("switching a Source off reaches the request's sources_used", async () => {
  const seen: AskRequest[] = [];
  await render(
    <AskPanel query={{ text: "budget?" }} sources={SOURCES} runAsk={scripted(CITED, seen)} runSearch={noSearch} />,
  );
  const box = container.querySelector('[aria-label="Use Travel policy"]') as HTMLElement;
  await act(async () => {
    box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("Using 1 of 2 Sources");
  await clickAsk();
  expect(seen[0].sourcesUsed).toEqual({ "doc-2": false });
  expect(toAskRequest(seen[0])).toMatchObject({ mode: "ask", text: "budget?", sources_used: { "doc-2": false } });
});

test("no Sources in the filter says so and cannot spend", async () => {
  const seen: AskRequest[] = [];
  await render(<AskPanel query={{ text: "anything" }} sources={[]} runAsk={scripted(CITED, seen)} runSearch={noSearch} />);
  expect(container.querySelector('[data-testid="ask-no-sources"]')!.textContent).toContain(
    "No Sources match the current filter",
  );
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Ask")!;
  expect(button.disabled).toBe(true);
  expect(seen).toHaveLength(0);
});

test("the monthly cap shows the knob's sentence and no answer", async () => {
  const message =
    "Your organization has used $25.00 of its $25.00 monthly Ask budget, so Ask is paused until October 1.";
  await render(
    <AskPanel
      query={{ text: "budget?" }}
      sources={SOURCES}
      runAsk={scripted([{ type: "ask_refused", reason: "cap_reached", message }])}
      runSearch={noSearch}
    />,
  );
  await clickAsk();
  expect(container.querySelector('[data-testid="ask-refused"]')!.textContent).toBe(message);
  expect(container.querySelector('[data-testid="ask-answer"]')).toBeNull();
});

test("given no sources, the panel reads the filter's sources section itself", async () => {
  const calls: unknown[] = [];
  const search: KnowledgeSearchRunner = async (q) => {
    calls.push(q);
    return [{ key: "sources", label: "Sources", count: 1, items: [SOURCES[0]], next_cursor: null }];
  };
  await render(<AskPanel query={{ text: "budget?", source_kinds: ["web_page"] }} runAsk={scripted(CITED)} runSearch={search} />);
  expect(calls).toEqual([{ mode: "find", source_kinds: ["web_page"], types: ["processed_document"] }]);
  expect(container.textContent).toContain("Using 1 of 1 Source");
});

test("the wire adapter reads the server's ask events", () => {
  const line = (data: unknown) => adaptAskEvent({ event: "data", data } as never);
  expect(line({ type: "answer_delta", text: "Hi [1]" })).toEqual({ type: "answer_delta", text: "Hi [1]" });
  expect(
    line({
      type: "citations",
      citations: [{ number: 1, segment_id: "s", source_id: "d", quote: "q", page_numbers: [2], locator: "p. 2" }],
      uncited_sentences: ["x"],
    }),
  ).toMatchObject({ type: "citations", citations: [{ number: 1, segment_id: "s", source_id: "d", locator: "p. 2" }] });
  expect(line({ type: "ask_refused", reason: "cap_reached", message: "m" })).toEqual({
    type: "ask_refused",
    reason: "cap_reached",
    message: "m",
  });
  expect(line({ type: "section", section: "sources" })).toBeNull();
  expect(citationHref({ source_id: "a b", segment_id: "c" })).toBe("/knowledge/sources/a%20b?chunk=c");
  // The server labels contexts S<n>; both spellings cite n.
  expect(tokenizeAnswer("Stars [S1, S3].")).toEqual([
    { kind: "text", text: "Stars " },
    { kind: "cite", raw: "[S1, S3]", numbers: [1, 3] },
    { kind: "text", text: "." },
  ]);
});

test("Sources behind the filter's Segments are listed and usable even when no Source title matched", async () => {
  const segs: KnowledgeHit[] = [
    { entity: "segment", id: "seg-a", title: "Quadrant", segment: { source_id: "doc-q", source_title: "Quadrant (instrument)" } },
    { entity: "segment", id: "seg-b", title: "Quadrant", segment: { source_id: "doc-q", source_title: "Quadrant (instrument)" } },
  ];
  await render(<AskPanel query={{ text: "quadrant?" }} sources={[]} segments={segs} runAsk={scripted(CITED)} runSearch={noSearch} />);
  expect(container.querySelector('[data-testid="ask-no-sources"]')).toBeNull();
  expect(container.textContent).toContain("Using 1 of 1 Source");
  expect(container.textContent).toContain("Quadrant (instrument)");
});
