/**
 * /knowledge/viewer/[id] mounts LibraryPreviewPage. While the document read is
 * in flight it has no pages yet — and the page-text pane used to answer that
 * with "No pages persisted yet… ingestion failed", a false failure flashed on
 * every open. A screen never lies: loading says loading; the failure sentence
 * appears only once the read has SETTLED with zero pages.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const docState: {
  doc: unknown;
  loading: boolean;
} = { doc: null, loading: true };

jest.mock("@/features/rag/hooks/useLibrary", () => ({
  useLibraryDoc: () => ({
    doc: docState.doc,
    loading: docState.loading,
    error: null,
    readError: null,
    reload: jest.fn(),
  }),
}));
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
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
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
jest.mock("@/features/rag/api/fork", () => ({ forkProcessedDocument: jest.fn() }));
jest.mock("@/lib/api/typed-client", () => ({
  apiGet: jest.fn(() => new Promise(() => {})),
  buildPath: (p: string) => p,
}));
jest.mock("@/features/shell/components/header/templates/EntityModeHeader", () => ({
  EntityModeHeader: () => null,
}));
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
