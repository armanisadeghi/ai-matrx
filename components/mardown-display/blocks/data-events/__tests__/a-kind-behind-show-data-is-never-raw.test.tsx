/** @jest-environment jsdom */
/**
 * A KIND IS NEVER DRAWN AS RAW JSON — explicit "show data" toggles and
 * invalid-payload fallbacks (B5, B6 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * B5: the workflow-step / function / fetch / search / categorization blocks
 * open a JSON <pre> behind a toggle. The toggle is a deliberate raw view, so
 * kindless data stays JSON — but a payload carrying `__kind` now renders
 * through `AnswerValueView` inside it.
 * B6: decision-answers / list-change-proposal / map-topic-proposal blocks
 * printed an unreadable payload as a raw <pre>; they now show the kind's
 * broken notice over the generic structured floor.
 *
 * RED BEFORE GREEN: before the fix every kind case drew a <pre> of JSON.
 */
import React, { act } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { createRoot, type Root } from "react-dom/client";

jest.mock(
  "@/features/content-ir/studio/components/KindInstanceRender",
  () => ({
    __esModule: true,
    default: ({ kind }: { kind: string }) => (
      <div data-route="kind">Kind component: {kind}</div>
    ),
  }),
);
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: ({ kind, note }: { kind?: string; note?: string }) => (
    <div data-route="floor">
      {kind} {note}
    </div>
  ),
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: () => <div data-route="markdown" />,
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
jest.mock("@ai-matrx/chat/agents/decision-answers/DecisionAnswers", () => ({
  DecisionAnswers: () => <div data-route="decision-answers" />,
}));
jest.mock("@/features/list-change-proposals/ListChangeProposalView", () => ({
  ListChangeProposalView: () => <div data-route="list-change" />,
}));
jest.mock(
  "@/features/marketing/seo/topical-map/proposals/MapTopicProposalView",
  () => ({ MapTopicProposalView: () => <div data-route="map-topic" /> }),
);

import FunctionResultBlock from "../FunctionResultBlock";
import WorkflowStepBlock from "../WorkflowStepBlock";
import DecisionAnswersBlock from "../../decision-answers/DecisionAnswersBlock";
import ListChangeProposalBlock from "../../list-change-proposal/ListChangeProposalBlock";
import MapTopicProposalBlock from "../../map-topic-proposal/MapTopicProposalBlock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flashcards = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
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

const route = (name: string) => container.querySelector(`[data-route="${name}"]`);
function openToggle() {
  const button = container.querySelector("button");
  act(() => button!.click());
}

describe("B5: a kind behind a show-data toggle", () => {
  it("a function result that is a kind renders as its kind", () => {
    act(() =>
      root.render(
        <FunctionResultBlock functionName="make_cards" success result={flashcards} />,
      ),
    );
    openToggle();
    expect(route("kind")).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("a workflow step's data with a kind renders as its kind", () => {
    act(() =>
      root.render(
        <WorkflowStepBlock stepName="Cards" status="complete" data={flashcards} />,
      ),
    );
    openToggle();
    expect(route("kind")).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("kindless data behind the toggle stays JSON", () => {
    act(() =>
      root.render(
        <FunctionResultBlock
          functionName="count_stops"
          success
          result={{ route: "North loop", stops: 14 }}
        />,
      ),
    );
    openToggle();
    expect(container.querySelector("pre")?.textContent).toContain("North loop");
    expect(route("kind")).toBeNull();
  });

  it.each([
    "FetchResultsBlock.tsx",
    "SearchResultsBlock.tsx",
    "CategorizationResultBlock.tsx",
  ])("%s opens its data through ToggledDataBody", (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");
    expect(source).toMatch(/<ToggledDataBody/);
    expect(source).not.toMatch(/\{JSON\.stringify\((item|metadata), null, 2\)\}/);
  });
});

describe("B6: an unreadable kind payload", () => {
  const broken = { __kind: "decision_answers", note: "answers missing" };

  it.each([
    ["decision answers", () => <DecisionAnswersBlock serverData={{ payload: broken }} />, "decision_answers"],
    ["list change proposal", () => <ListChangeProposalBlock serverData={{ proposal: { __kind: "list_change_proposal_v1" } }} />, "list_change_proposal_v1"],
    ["map topic proposal", () => <MapTopicProposalBlock serverData={{ proposal: { __kind: "map_topic_proposal_v1" } }} />, "map_topic_proposal_v1"],
  ])("%s shows the broken notice over the structured floor", (_name, el, kind) => {
    act(() => root.render(el()));
    expect(container.querySelector("pre")).toBeNull();
    expect(route("floor")?.textContent).toContain(kind);
    expect(container.innerHTML).not.toContain('"__kind"');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
