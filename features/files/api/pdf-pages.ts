import {
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";

export interface PdfPageRange {
  start: number;
  end: number;
}

export interface PdfPageSelectionRequest {
  pages?: number[];
  page_ranges?: PdfPageRange[];
  signed_ttl?: number;
}

export interface PdfOutputPageMap {
  output_page: number;
  source_page: number;
}

export interface SelectedPdfFileRef {
  file_id: string;
  visibility: "public" | "private" | "shared";
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  cdn_url: string | null;
  signed_url: string | null;
  signed_url_expires_at: number | null;
  download_url: string | null;
  thumbnail_url: string | null;
}

export interface PdfPageSelectionResult {
  source_file_id: string;
  source_pages: number[];
  output_page_map: PdfOutputPageMap[];
  source_page_count: number;
  source_size_bytes: number | null;
  source_bytes_fetched: number;
  source_fetch_strategy: "cache_hit" | "full_object_stream_to_disk";
  cache_hit: boolean;
  file: SelectedPdfFileRef;
}

/** Build or reuse one PDF containing only the requested physical source pages. */
export function selectPdfPages(
  fileId: string,
  request: PdfPageSelectionRequest,
  opts: RequestOptions = {},
): Promise<{ data: PdfPageSelectionResult; meta: ResponseMeta }> {
  return postJson<PdfPageSelectionResult, PdfPageSelectionRequest>(
    `/files/${encodeURIComponent(fileId)}/pdf-pages`,
    request,
    opts,
  );
}
