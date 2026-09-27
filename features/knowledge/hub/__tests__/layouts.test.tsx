/**
 * Every browse layout renders the SAME results from the fixture runner:
 * list (virtualized), table (the design system's data table), board (by kind)
 * and gallery — and a failed lane shows its sentence with a retry instead of
 * vanishing.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BrowseResults, browseHits } from "@/features/knowledge/hub/components/HubResults";
import { createFixtureRunner } from "@/features/knowledge/api/knowledgeSearchFixture";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { ResultHandlers } from "@/features/knowledge/hub/components/HubResultRow";
import type { HubLayout } from "@/features/knowledge/hub/hubState";
import type { KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";

function toStates(sections: KnowledgeSection[]): SectionState[] {
  return sections.map((s) => ({
    key: s.key,
    status: s.error ? "error" : "ready",
    section: s,
    loadingMore: false,
    moreError: null,
  }));
}

const handlers: ResultHandlers = {
  selected: new Set(),
  focusedKey: null,
  peekKey: null,
  onToggleSelect: jest.fn(),
  onFocus: jest.fn(),
  onOpen: jest.fn(),
  onOpenFull: jest.fn(),
};

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

async function render(layout: HubLayout, fail?: KnowledgeSection["key"][]) {
  const run = createFixtureRunner({ failSections: fail });
  const sections = toStates(await run({ mode: "find", types: ["note", "processed_document"] }));
  const hits = browseHits(sections);
  await act(async () => {
    root.render(
      <div style={{ height: 800 }}>
        <BrowseResults
          layout={layout}
          sections={sections}
          hits={hits}
          handlers={handlers}
          emptySentence="Nothing here."
          onShowMore={jest.fn()}
          onRetry={jest.fn()}
        />
      </div>,
    );
  });
  return hits;
}

describe.each<HubLayout>(["list", "table", "board", "gallery"])("%s layout", (layout) => {
  it("renders the fixture's results", async () => {
    const hits = await render(layout);
    expect(hits.length).toBeGreaterThan(5);
    // The newest note and the newest Source are on screen in every layout.
    expect(host.textContent).toContain("NSF grant solicitation 2026");
    expect(host.textContent).toContain("Grant budget assumptions");
  });
});

it("board groups by kind with counts", async () => {
  await render("board");
  const headings = [...host.querySelectorAll("section h3")].map((h) => h.textContent);
  expect(headings.some((t) => t?.startsWith("Note"))).toBe(true);
  expect(headings.some((t) => t?.startsWith("Document") || t?.startsWith("Web page"))).toBe(true);
});

it("a failed lane says so with a retry, and the other lanes still render", async () => {
  await render("list", ["notes"]);
  expect(host.textContent).toContain("The Notes lane did not answer");
  expect(host.textContent).toContain("Try again");
  expect(host.textContent).toContain("NSF grant solicitation 2026");
  expect(host.textContent).not.toContain("Grant budget assumptions");
});
