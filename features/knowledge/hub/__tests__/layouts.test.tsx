/**
 * Every browse layout renders the SAME results from the fixture runner:
 * list (virtualized), table (the design system's data table), board (by kind)
 * and gallery — and a failed lane shows its sentence with a retry instead of
 * vanishing.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BrowseResults, browseHits, searchHitsByItem } from "@/features/knowledge/hub/components/HubResults";
import { HubRowMenu } from "@/features/knowledge/hub/components/HubRowMenu";
import { createFixtureRunner } from "@/features/knowledge/api/knowledgeSearchFixture";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { ResultHandlers } from "@/features/knowledge/hub/components/HubResultRow";
import type { HubLayout } from "@/features/knowledge/hub/hubState";
import type { KnowledgeHit, KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";
import { ClipboardCopy, Copy, Link2 } from "lucide-react";

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

it("keeps the canonical table footer and distinguishes a loaded source window from its total", async () => {
  const onShowMore = jest.fn();
  const sections = toStates(await createFixtureRunner()({ mode: "find", types: ["note", "processed_document"] }));
  const cursorSection = sections.find((section) => section.section?.items.length);
  if (!cursorSection?.section) throw new Error("Fixture did not provide a result section.");
  cursorSection.section = {
    ...cursorSection.section,
    count: (cursorSection.section.count ?? 0) + 100,
    next_cursor: "next-window",
  };
  const hits = browseHits(sections);
  const sourceTotal = sections
    .filter((section) => section.key !== "top_hit" && section.key !== "segments")
    .reduce((total, section) => total + (section.section?.count ?? 0), 0);

  await act(async () => {
    root.render(
      <div style={{ height: 800 }}>
        <BrowseResults
          layout="table"
          sections={sections}
          hits={hits}
          handlers={handlers}
          emptySentence="Nothing here."
          onShowMore={onShowMore}
          onRetry={jest.fn()}
        />
      </div>,
    );
  });

  expect(host.querySelector("[data-matrx-table-footer]")).not.toBeNull();
  expect(host.querySelector('[data-matrx-table-coverage-scope="all"]')?.textContent).toContain("Partial");
  expect(host.textContent).toContain(`Showing the ${hits.length} items loaded so far out of ${sourceTotal} items in this table.`);
  expect(host.querySelector("[data-matrx-table-footer]")?.textContent).toContain(`${hits.length} / ${sourceTotal} loaded`);
  const loadMore = [...host.querySelectorAll("button")].find((button) => button.textContent === "Load more");
  expect(loadMore).toBeDefined();
  await act(async () => loadMore?.click());
  expect(onShowMore).toHaveBeenCalledWith(cursorSection.key);
});

it("keeps a passage-only search result's total unknown", async () => {
  const segment =
    ({
      entity: "segment",
      id: "segment-1",
      title: "Forklift safety",
      snippet: "forklift inspection",
      segment: { source_id: "passage-only-source", source_title: "Forklift safety" },
    }) as KnowledgeHit;
  const sections: SectionState[] = [
    {
      key: "sources",
      status: "ready",
      section: { key: "sources", label: "Sources", count: 100, items: [], next_cursor: null },
      loadingMore: false,
      moreError: null,
    },
    {
      key: "segments",
      status: "ready",
      section: { key: "segments", label: "Passages", count: 1, items: [segment], next_cursor: "passage-next" },
      loadingMore: false,
      moreError: null,
    },
  ];
  const hits = searchHitsByItem(sections);
  expect(hits).toHaveLength(1);

  await act(async () => {
    root.render(
      <div style={{ height: 800 }}>
        <BrowseResults
          layout="table"
          highlight="forklift"
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

  expect(host.querySelector('[data-matrx-table-coverage-scope="all"]')?.textContent).toContain("Unknown total");
  expect(host.textContent).toContain("The total number of items in this table is not known.");
  expect(host.textContent).not.toContain("out of 100 items in this table.");
  expect(host.querySelector("[data-matrx-table-footer]")?.textContent).not.toContain(" / 100 loaded");
});

it("uses the table-owned Alchemy control for transcript copy while retaining transcript links", async () => {
  const transcriptProjection = {
    human: "Transcript: User interview\nDuration: 12 min\nWords: 1,250",
    agent: {
      id: "transcript-1",
      kind: "transcript",
      title: "User interview",
      duration_seconds: 720,
      word_count: 1250,
      href: "/transcripts/processor?focus=transcript-1",
      body_included: false,
    },
    kind: "transcript-hub-item",
    location: "/knowledge?view=transcripts",
    description: "One transcript item from the Knowledge hub — metadata only; no transcript body.",
    attributes: { rows: 1 },
  };
  const copyProjection = jest.fn(() => transcriptProjection);
  const copyListProjection = jest.fn((rows: KnowledgeHit[]) => ({
    kind: "transcript-hub-list",
    location: "/knowledge?view=transcripts",
    description: "Transcript items selected in the Knowledge hub. Metadata only; no transcript bodies.",
    data: rows.map(() => transcriptProjection.agent),
    attributes: { rows: rows.length },
  }));
  const transcript = {
    entity: "transcript",
    id: "transcript-1",
    title: "User interview",
    source_kind: "transcript",
    snippet: "The opening words shown in the Knowledge Hub.",
  } as KnowledgeHit;
  const transcriptHandlers: ResultHandlers = {
    ...handlers,
    copyProjection,
    copyListProjection,
    rowMenu: () => (
      <HubRowMenu
        title={transcript.title}
        groups={[
          {
            id: "copy",
            submenu: { label: "Copy", icon: Copy },
            items: [
              { id: "copy", label: "Copy", icon: Copy, onSelect: jest.fn() },
              { id: "copy-ai", label: "Copy for AI", icon: ClipboardCopy, onSelect: jest.fn() },
              { id: "copy-link", label: "Copy link", icon: Link2, onSelect: jest.fn() },
            ],
          },
        ]}
      />
    ),
  };

  await act(async () => {
    root.render(
      <div style={{ height: 800 }}>
        <BrowseResults
          layout="table"
          sections={[]}
          hits={[transcript]}
          handlers={transcriptHandlers}
          emptySentence="Nothing here."
          onShowMore={jest.fn()}
          onRetry={jest.fn()}
        />
      </div>,
    );
  });

  const alchemy = host.querySelector<HTMLElement>('[data-alchemy-trigger]');
  expect(alchemy).not.toBeNull();
  await act(async () => alchemy?.click());
  expect(copyProjection).toHaveBeenCalledWith(transcript);
  expect(copyListProjection).toHaveBeenCalledWith([transcript]);
  expect(document.body.textContent).toContain("Transcript metadata");
  expect(copyProjection.mock.results[0]?.value).toMatchObject({
    human: "Transcript: User interview\nDuration: 12 min\nWords: 1,250",
    agent: {
      duration_seconds: 720,
      word_count: 1250,
      href: "/transcripts/processor?focus=transcript-1",
      body_included: false,
    },
  });
  expect(copyListProjection.mock.results[0]?.value).toMatchObject({
    kind: "transcript-hub-list",
    location: "/knowledge?view=transcripts",
    data: [
      {
        duration_seconds: 720,
        word_count: 1250,
        href: "/transcripts/processor?focus=transcript-1",
        body_included: false,
      },
    ],
    attributes: { rows: 1 },
  });
});

it("copies one selected transcript as one no-body transcript-list payload", async () => {
  const rows = ["transcript-1", "transcript-2"].map(
    (id) =>
      ({
        entity: "transcript",
        id,
        title: `Interview ${id}`,
        source_kind: "transcript",
      }) as KnowledgeHit,
  );
  const copyProjection = (row: KnowledgeHit) => ({
    human: `Transcript: ${row.title}`,
    agent: {
      id: row.id,
      kind: "transcript",
      href: `/transcripts/processor?focus=${row.id}`,
      body_included: false,
    },
    kind: "transcript-hub-item",
    location: "/knowledge?view=transcripts",
    description: "One transcript item from the Knowledge hub — metadata only; no transcript body.",
    attributes: { rows: 1 },
  });
  const copyListProjection = jest.fn((visible: KnowledgeHit[]) => ({
    kind: "transcript-hub-list",
    location: "/knowledge?view=transcripts",
    description: "Transcript items selected in the Knowledge hub. Metadata only; no transcript bodies.",
    data: visible.map((row) => copyProjection(row).agent),
    attributes: { rows: visible.length, body_included: false },
  }));
  function SelectionFixture() {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const selectedHandlers: ResultHandlers = {
      ...handlers,
      selected,
      onToggleSelect: (row) =>
        setSelected((current) => {
          const next = new Set(current);
          const key = `${row.entity}:${row.id}`;
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),
      copyProjection,
      copyListProjection,
    };
    return (
      <div style={{ height: 800 }}>
        <BrowseResults
          layout="table"
          sections={[]}
          hits={rows}
          handlers={selectedHandlers}
          emptySentence="Nothing here."
          onShowMore={jest.fn()}
          onRetry={jest.fn()}
        />
      </div>
    );
  }

  await act(async () => root.render(<SelectionFixture />));
  copyListProjection.mockClear();
  const select = host.querySelector<HTMLButtonElement>('[aria-label^="Select this transcript record"]');
  expect(select).not.toBeNull();
  await act(async () => select?.click());
  const bulkBar = host.querySelector('[data-matrx-table-bulk-bar]');
  expect(bulkBar).not.toBeNull();
  const selectedAlchemy = bulkBar?.querySelector<HTMLElement>('[data-alchemy-trigger]');
  expect(selectedAlchemy).not.toBeNull();
  await act(async () => selectedAlchemy?.click());
  const copyForAi = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.trim().startsWith("Copy for AI"),
  );
  expect(copyForAi).toBeDefined();
  const clipboard = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  await act(async () => copyForAi?.click());

  const copied = clipboard.mock.calls[0]?.[0] as string;
  expect(copied).toContain("transcript-hub-list");
  expect(copied).toContain("transcript-1");
  expect(copied).toContain('rows="1"');
  expect(copied).toContain('body_included="false"');
  expect(copied).toContain("metadata only");
  expect(copied).not.toContain("transcript-2");

  const selectedProjection = copyListProjection.mock.results
    .map((result) => result.value)
    .find((projection) => projection.attributes.rows === 1);
  expect(selectedProjection).toMatchObject({
    kind: "transcript-hub-list",
    location: "/knowledge?view=transcripts",
    data: [
      {
        id: "transcript-1",
        href: "/transcripts/processor?focus=transcript-1",
        body_included: false,
      },
    ],
    attributes: { rows: 1, body_included: false },
  });
  expect(bulkBar?.textContent).toContain("1 transcript record (metadata only) selected");
});

it("a failed lane says so with a retry, and the other lanes still render", async () => {
  await render("list", ["notes"]);
  expect(host.textContent).toContain("The Notes lane did not answer");
  expect(host.textContent).toContain("Try again");
  expect(host.textContent).toContain("NSF grant solicitation 2026");
  expect(host.textContent).not.toContain("Grant budget assumptions");
});
