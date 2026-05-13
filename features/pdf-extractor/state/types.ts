export type PaneKey = "pdf" | "raw" | "clean" | "chunks" | "extractions";
export type SidebarView = "files" | "pages";
export type EditMode = "crop" | "reorder" | null;

export interface ApiChunkRow {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  parent_chunk_id: string | null;
  page_numbers: number[] | null;
  token_count: number | null;
  content_text: string;
  has_oai_embedding: boolean;
  has_voyage_embedding: boolean;
  section_kind: string | null;
}

export interface ApiChunksResponse {
  chunks: ApiChunkRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PerDocUi {
  visiblePanes: PaneKey[];
  sidebarView: SidebarView;
}

export type ChunksFetchStatus = "idle" | "loading" | "ready" | "error";

export interface ChunksCacheEntry {
  status: ChunksFetchStatus;
  rows: ApiChunkRow[];
  total: number;
  error: string | null;
  fetchedAt: number;
}

export interface PdfStudioState {
  activeDocId: string | null;
  activePage: number | null;
  pendingScrollPage: number | null;
  scrollSource: PaneKey | null;

  perDoc: Record<string, PerDocUi>;
  defaultPerDoc: PerDocUi;

  chunks: Record<string, Record<number, ChunksCacheEntry>>;
}

export const DEFAULT_PER_DOC: PerDocUi = {
  visiblePanes: ["pdf", "raw", "clean"],
  sidebarView: "pages",
};

export const STORAGE_KEY_PREFIX = "pdf-studio:v1:perDoc:";
