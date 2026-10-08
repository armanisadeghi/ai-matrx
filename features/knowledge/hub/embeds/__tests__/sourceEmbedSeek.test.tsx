/**
 * The Source screen in the peek (`SourceStudio embedded`): no shell header
 * (its actions sit in an inline bar), a narrow pane opens a recording on its
 * Original, and a hit's deep link lands — the player seeks to `t0_ms`, or to
 * the chunk's portion start when the hit carries no explicit moment; a PDF
 * opens at the hit's page.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SourceDeepLink } from "@/features/source-studio/sourceStudioModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useMediaQuery: () => true }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
let mockDoc: Record<string, unknown> = {};
const mockVersion = {
  loading: false,
  versions: { currentId: "doc-1", originalId: "doc-1", edited: false },
  facts: null,
  error: null,
  jobEndedWithoutText: null,
  reload: noop,
};
jest.mock("@/features/sources/hooks/useCurrentVersion", () => ({ useCurrentVersion: () => mockVersion }));
const portion = (i: number, locator: unknown) => ({
  pageIndex: i,
  pageNumber: i + 1,
  rawText: `part ${i + 1}`,
  cleanedText: `part ${i + 1}`,
  locator: { page_index: i, page_number: i + 1, portion_kind: "segment", locator },
});
let mockPortions: ReturnType<typeof portion>[] = [];
jest.mock("@/features/source-studio/hooks/useSourceData", () => ({
  useSourceDoc: () => ({ doc: mockDoc, loading: false, error: null, reload: () => undefined }),
  useSourcePortions: () => ({ portions: mockPortions, loading: false, error: null, reload: () => undefined }),
  useSourceMedia: () => ({ media: null, loading: false, error: null }),
  useSourceChunks: () => ({
    chunks: [{ id: "chunk-2", page_numbers: [2] }],
    total: 1,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
  useSourceEntities: () => ({ entities: [], loading: false, error: null, truncated: false }),
  useExtractionCoverage: () => null,
}));
jest.mock("@/features/rag/hooks/useLibrary", () => ({ useLibraryDoc: () => ({ doc: null, error: null, reload: () => undefined }) }));
jest.mock("@/features/rag/hooks/useDocumentSearch", () => ({
  useDocumentSearch: () => ({ activeQuery: "", hits: [], summary: null, run: async () => [] }),
}));
jest.mock("@/features/sources/hooks/useSourceKept", () => ({ useSourceKept: () => ({ keptAt: null, reload: () => undefined }) }));
jest.mock("@/features/scraper/hooks/useScraperApi", () => ({ useScraperApi: () => ({ scrapeUrl: jest.fn() }) }));
jest.mock("@/features/shell/components/header/templates/EntityModeHeader", () => ({
  EntityModeHeader: () => <div data-testid="shell-header" />,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/rag/agent-context/buildRagViewerContextData", () => ({ buildRagViewerContextData: () => ({}) }));
const mockOriginal = jest.fn();
jest.mock("@/features/source-studio/components/OriginalPane", () => ({
  OriginalPane: (p: { seek: { seconds: number } | null; pageNumber: number | null; view: { kind: string } }) => {
    mockOriginal(p);
    return <div data-testid="original" data-kind={p.view.kind} />;
  },
}));
jest.mock("@/features/source-studio/components/SourceSidePanes", () => ({ SourceSidePanes: () => null }));
jest.mock("@/features/source-studio/components/WebSourceView", () => ({ WebSourceView: () => <div data-testid="web" /> }));
jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({ MatrxDynamicPanelHost: () => null }));
jest.mock("@/features/rag/components/library/KnowledgeAssetPanel", () => ({ KnowledgeAssetPanel: () => null }));
jest.mock("@/features/pdf-extractor/studio/PdfStudioReader", () => ({
  PaneHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));
jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({ RichContent: () => null }));
jest.mock("@/features/sources/SaveSourcePanel", () => ({ SaveSourcePanel: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/components/ui/drawer", () => ({
  Drawer: () => null,
  DrawerContent: () => null,
  DrawerHeader: () => null,
  DrawerTitle: () => null,
}));
jest.mock("@/features/sources/api/sourcesApi", () => ({ editSource: jest.fn(), keepSource: jest.fn(), sourceRefusalSentence: () => "" }));
jest.mock("@/features/sources/api/processNow", () => ({ processSourceNow: jest.fn() }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));
jest.mock("@/components/agent-copy/export", () => ({ exportFilename: () => "x.md" }));
jest.mock("@ai-matrx/kit/download", () => ({ downloadFile: jest.fn(), downloadUrl: jest.fn() }));

import { SourceStudio } from "@/features/source-studio/components/SourceStudio";

const baseDoc = {
  id: "doc-1",
  name: "Talk",
  organization_id: "org-1",
  kept_at: null,
  derivation_kind: "capture",
  parent_processed_id: null,
  total_pages: 2,
  origin_client: null,
  capture_method: null,
  created_at: "2026-09-27T00:00:00Z",
  source_id: "src-1",
  original_file_id: null,
  mime_type: null,
  canonical_identity: null,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockOriginal.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const link = (l: Partial<SourceDeepLink>): SourceDeepLink => ({ page: null, chunkId: null, assets: false, ms: null, ...l });
const lastSeek = () => mockOriginal.mock.calls.at(-1)?.[0].seek ?? null;

describe("a transcript Source in the peek", () => {
  beforeEach(() => {
    mockDoc = { ...baseDoc, source_kind: "transcript", metadata: { url: "https://www.youtube.com/watch?v=abcdefghijk" } };
    mockPortions = [portion(0, { t0_ms: 0 }), portion(1, { t0_ms: 30_000 })];
  });

  it("drops the shell header for an inline action bar and opens on the player", () => {
    act(() => root.render(<SourceStudio documentId="doc-1" deepLink={link({})} embedded />));
    expect(host.querySelector("[data-testid=shell-header]")).toBeNull();
    expect(host.querySelector("[data-testid=source-embedded-actions]")?.textContent).toContain("Process now");
    expect(host.querySelector("[data-testid=original]")?.getAttribute("data-kind")).toBe("youtube");
    expect(lastSeek()).toBeNull();
  });

  it("the hit's t0_ms seeks the player", () => {
    act(() => root.render(<SourceStudio documentId="doc-1" deepLink={link({ chunkId: "chunk-2", ms: 65_000 })} embedded />));
    expect(lastSeek()).toMatchObject({ seconds: 65 });
  });

  it("without t0_ms, the hit's chunk plays from its portion's start", () => {
    act(() => root.render(<SourceStudio documentId="doc-1" deepLink={link({ chunkId: "chunk-2" })} embedded />));
    expect(lastSeek()).toMatchObject({ seconds: 30 });
  });

  it("the full page keeps its shell header", () => {
    act(() => root.render(<SourceStudio documentId="doc-1" deepLink={link({})} />));
    expect(host.querySelector("[data-testid=shell-header]")).not.toBeNull();
    expect(host.querySelector("[data-testid=source-embedded-actions]")).toBeNull();
  });
});

describe("a PDF Source in the peek", () => {
  it("opens the PDF viewer at the hit's page", () => {
    mockDoc = { ...baseDoc, name: "Deck", source_kind: "cld_file", mime_type: "application/pdf", original_file_id: "file-1", metadata: {} };
    mockPortions = [portion(0, { page: 1 }), portion(1, { page: 2 })];
    act(() => root.render(<SourceStudio documentId="doc-1" deepLink={link({ page: 2, chunkId: "chunk-2" })} embedded />));
    const last = mockOriginal.mock.calls.at(-1)?.[0];
    expect(last.view.kind).toBe("pdf");
    expect(last.pageNumber).toBe(2);
    expect(last.seek).toBeNull();
  });
});
