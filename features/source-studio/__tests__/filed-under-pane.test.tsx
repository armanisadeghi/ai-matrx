/**
 * "Attached to" uses the platform primitive: when the installed
 * the pane renders AssociationCardGrid anchored on the Source with
 * `direction: "outgoing"` (`@ai-matrx/associations` 0.11.0 filed-under mode).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seen: { primary: unknown }[] = [];
jest.mock("@ai-matrx/associations/react", () => {
  const React = jest.requireActual("react");
  const Ctx = React.createContext(null);
  return {
    PrimaryEntityProvider: ({ value, children }: { value: unknown; children: unknown }) =>
      React.createElement(Ctx.Provider, { value }, children),
    AssociationCardGrid: () => {
      seen.push({ primary: React.useContext(Ctx) });
      return React.createElement("div", { "data-testid": "grid" });
    },
  };
});
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
jest.mock("@/features/rag/components/library/ChunkList", () => ({ ChunkCard: () => null }));
jest.mock("@/features/rag/components/library/DocumentSearch", () => ({
  DocumentSearchBar: () => null,
  DocumentSearchResultsList: () => null,
  DocumentSearchSummary: () => null,
}));

import { SourceSidePanes, type SourceSidePanesProps } from "@/features/source-studio/components/SourceSidePanes";

function props(): SourceSidePanesProps {
  return {
    tab: "associations",
    onTabChange: () => undefined,
    chunks: [],
    chunkTotal: 0,
    chunksLoading: false,
    chunksError: null,
    highlightChunkId: null,
    chunkGoLabel: () => null,
    onChunkGo: () => undefined,
    search: {} as SourceSidePanesProps["search"],
    onSearchSubmit: () => undefined,
    onJumpToPage: () => undefined,
    activePageNumber: 1,
    indexing: false,
    processing: false,
    onProcessNow: null,
    entities: [],
    entitiesLoading: false,
    entitiesError: null,
    entitiesTruncated: false,
    entitiesState: { kind: "done" },
    onEntityGo: () => undefined,
    source: { id: "src-1", orgId: "org-1", label: "A Source" },
  };
}

function mount() {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<SourceSidePanes {...props()} />));
  return { host, root };
}

it("renders the grid anchored on the Source, filed-under", () => {
  const { host, root } = mount();
  expect(host.querySelector('[data-testid="grid"]')).not.toBeNull();
  expect(seen.at(-1)?.primary).toEqual({
    type: "processed_document",
    id: "src-1",
    orgId: "org-1",
    label: "A Source",
    direction: "outgoing",
  });
  act(() => root.unmount());
});

it("an empty Entities pane says extraction is unavailable — never 'none found' — when it failed", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() =>
    root.render(
      <SourceSidePanes
        {...props()}
        tab="entities"
        chunkTotal={3}
        entitiesState={{ kind: "failed", sentence: "the provider refused the key" }}
      />,
    ),
  );
  const text = host.textContent ?? "";
  expect(text).toContain("Entity extraction is unavailable: the provider refused the key.");
  expect(text).not.toMatch(/were found/);
  act(() =>
    root.render(<SourceSidePanes {...props()} tab="entities" chunkTotal={3} entitiesState={{ kind: "not_run" }} />),
  );
  expect(host.textContent).toContain("Not yet extracted");
  act(() => root.unmount());
});
