/**
 * /knowledge/viewer/[id] mounts LibraryPreviewPage. While the document read is
 * in flight it has no pages yet — and the page-text pane used to answer that
 * with "No pages persisted yet… ingestion failed", a false failure flashed on
 * every open. A screen never lies: loading says loading; the failure sentence
 * appears only once the read has SETTLED with zero pages.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; the page header measures its breadcrumb with one.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const docState: {
  doc: unknown;
  loading: boolean;
} = { doc: null, loading: true };

const versionState: {
  loading: boolean;
  versions: { originalId: string; currentId: string; edited: boolean } | null;
  error: string | null;
} = {
  loading: false,
  versions: { originalId: "d1", currentId: "d1", edited: false },
  error: null,
};
jest.mock("@/features/sources/hooks/useCurrentVersion", () => ({
  useCurrentVersion: () => versionState,
}));
const docReads: (string | null)[] = [];
jest.mock("@/features/rag/hooks/useLibrary", () => ({
  // Faithful to the real hook: no id → no read, no document, not loading.
  useLibraryDoc: (id: string | null) => (
    docReads.push(id),
    {
      doc: id ? docState.doc : null,
      loading: id ? docState.loading : false,
      error: null,
      readError: null,
      reload: jest.fn(),
    }
  ),
}));
const pageReads: string[] = [];
jest.mock("@/features/sources/hooks/usePortionLocators", () => ({
  usePortionLocators: () => ({ byIndex: new Map() }),
}));
jest.mock("@/features/rag/hooks/useDocumentSearch", () => ({
  useDocumentSearch: () => ({
    query: "",
    activeQuery: "",
    setQuery: jest.fn(),
    run: jest.fn(async () => []),
    clear: jest.fn(),
    loading: false,
    hasSearched: false,
    summary: null,
    hits: null,
    error: null,
    resultNonce: 0,
  }),
}));
jest.mock("@/features/rag/hooks/useLibraryProvenance", () => ({
  useFilesLibraryProvenance: () => ({ labelByFile: new Map() }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/features/rag/components/library/ChunkList", () => ({
  ChunksOnPage: () => null,
}));
jest.mock("@/features/rag/components/library/KnowledgeAssetPanel", () => ({
  KnowledgeAssetPanel: () => null,
}));
jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({
  MatrxDynamicPanelHost: () => null,
}));
jest.mock("@/features/rag/components/library/DocumentSearch", () => ({
  DocumentSearchBar: () => null,
  DocumentSearchSummary: () => null,
  SearchResultsList: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => <div>access-gate</div>,
}));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({
  useOpenDiffViewerWindow: () => jest.fn(),
}));
jest.mock("@/features/rag/api/fork", () => ({
  forkProcessedDocument: jest.fn(),
}));
jest.mock("@/lib/api/typed-client", () => ({
  apiGet: jest.fn((path: string) => {
    pageReads.push(path);
    return new Promise(() => {});
  }),
  buildPath: (p: string, params: Record<string, unknown>) =>
    `${p}|${String(params.processed_document_id)}`,
}));
jest.mock(
  "@/features/shell/components/header/templates/EntityModeHeader",
  () => ({
    EntityModeHeader: () => null,
  }),
);
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { LibraryPreviewPage } from "@/features/rag/components/library/LibraryPreviewPage";

const FAILURE = /No pages persisted yet/;
const LOADING = /Loading this document/;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function show(ui: React.ReactElement): string {
  act(() => root.render(ui));
  return host.textContent ?? "";
}

describe("the knowledge viewer while its document loads", () => {
  it.each([true, false])(
    "says it is loading — never that ingestion failed (embedded=%s)",
    (embedded) => {
      docState.doc = null;
      docState.loading = true;
      const text = show(
        <LibraryPreviewPage documentId="d1" embedded={embedded} />,
      );
      expect(text).not.toMatch(FAILURE);
      expect(text).toMatch(LOADING);
    },
  );

  it("says the pages are missing once the read settled with none", () => {
    docState.doc = {
      id: "d1",
      name: "Doc",
      sourceId: null,
      status: "extracted",
      pagesPersisted: 0,
      chunks: 0,
      embeddingsOai: 0,
      pages: [],
    };
    docState.loading = false;
    const text = show(<LibraryPreviewPage documentId="d1" embedded />);
    expect(text).toMatch(FAILURE);
    expect(text).not.toMatch(LOADING);
  });
});

describe("the knowledge viewer shows the version people read", () => {
  const doc = {
    id: "x",
    name: "Doc",
    sourceId: null,
    status: "ready",
    pagesPersisted: 1,
    chunks: 1,
    embeddingsOai: 0,
    pages: [],
  };
  beforeEach(() => {
    docReads.length = 0;
    pageReads.length = 0;
    docState.doc = doc;
    docState.loading = false;
  });
  afterAll(() => {
    versionState.versions = {
      originalId: "d1",
      currentId: "d1",
      edited: false,
    };
    versionState.loading = false;
  });

  it("opened on a capture with an edit, it reads the EDIT's pages and says so", () => {
    versionState.loading = false;
    versionState.versions = {
      originalId: "cap",
      currentId: "edit",
      edited: true,
    };
    const text = show(<LibraryPreviewPage documentId="cap" embedded />);
    expect(docReads.filter(Boolean).every((id) => id === "edit")).toBe(true);
    expect(docReads).toContain("edit");
    expect(pageReads.some((p) => p.endsWith("|edit"))).toBe(true);
    expect(pageReads.some((p) => p.endsWith("|cap"))).toBe(false);
    expect(text).toMatch(/Showing edited version/);
    expect(text).toMatch(/View original/);
  });

  it("View original switches every read to the original capture", () => {
    versionState.versions = {
      originalId: "cap",
      currentId: "edit",
      edited: true,
    };
    show(<LibraryPreviewPage documentId="cap" embedded />);
    const btn = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "View original",
    );
    expect(btn).toBeTruthy();
    act(() => btn!.click());
    expect(docReads[docReads.length - 1]).toBe("cap");
    expect(host.textContent).toMatch(/Showing the original capture/);
    expect(host.textContent).toMatch(/View edited version/);
  });

  it("reads nothing while the version is being resolved", () => {
    versionState.loading = true;
    versionState.versions = null;
    const text = show(<LibraryPreviewPage documentId="cap" embedded />);
    expect(docReads.filter(Boolean)).toEqual([]);
    expect(pageReads).toEqual([]);
    expect(text).toMatch(LOADING);
    expect(text).not.toMatch(FAILURE);
  });

  it("an unedited Source shows no switch", () => {
    versionState.loading = false;
    versionState.versions = { originalId: "a", currentId: "a", edited: false };
    const text = show(<LibraryPreviewPage documentId="a" embedded />);
    expect(text).not.toMatch(/View original|Showing edited/);
  });
});
