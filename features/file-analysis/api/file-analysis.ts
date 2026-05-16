/**
 * features/file-analysis/api/file-analysis.ts
 *
 * REST wrappers for the new file-analysis surface (analysis pipeline, page
 * management, annotations, redaction mask/restore, entities, search,
 * region extraction, server render-with-overlay). Mirrors the
 * `features/files/api/files.ts` style — thin typed wrappers over the
 * shared `client` helpers.
 *
 * Backend routes built in this round and exposed via OpenAPI:
 *   GET    /files/{file_id}/analysis
 *   POST   /files/{file_id}/analysis/refresh
 *   GET    /files/{file_id}/pages
 *   GET    /files/{file_id}/active-pages
 *   GET    /files/{file_id}/pages/{page_id}
 *   POST   /files/{file_id}/pages/{page_id}/exclude
 *   POST   /files/{file_id}/pages/{page_id}/include
 *   POST   /files/{file_id}/pages/{page_id}/rotate
 *   POST   /files/{file_id}/pages/{page_id}/override-text
 *   GET    /files/{file_id}/overrides
 *   GET    /files/{file_id}/annotations
 *   POST   /files/{file_id}/annotations
 *   PUT    /files/{file_id}/annotations/{aid}
 *   DELETE /files/{file_id}/annotations/{aid}
 *   POST   /files/{file_id}/annotations/extract-at-bbox
 *   POST   /files/{file_id}/annotations/snap-bbox
 *   POST   /files/{file_id}/annotations/bulk-from-candidates
 *   GET    /files/{file_id}/annotations/manifest
 *   GET    /annotations/label-catalog
 *   GET    /files/{file_id}/key-findings
 *   GET    /files/{file_id}/entities
 *   POST   /files/{file_id}/entities
 *   PUT    /files/{file_id}/entities/{eid}
 *   DELETE /files/{file_id}/entities/{eid}
 *   POST   /files/{file_id}/entities/find-similar
 *   POST   /files/{file_id}/annotations/{aid}/promote-to-entity
 *   POST   /files/{file_id}/search
 *   POST   /files/{file_id}/regions/extract
 *   POST   /files/{file_id}/render-page-with-overlay
 *   GET    /files/{file_id}/extracted-text
 *   POST   /files/{file_id}/redact/mask
 *   POST   /redact/restore
 *   POST   /redact/sessions/{session_id}/revoke
 */

import {
  delJson,
  getJson,
  postJson,
  putJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";

// ─── Type re-exports (named locally for callers) ────────────────────────────

type Schemas = components["schemas"];

export type FileAnalysisResponse = Schemas["FileAnalysisResponse"];
export type FileAnalysisHead = Schemas["FileAnalysisHead"];
export type FileAnalysisResultRow = Schemas["FileAnalysisResultRow"];
export type AnalyzeRefreshBody = Schemas["AnalyzeRefreshBody"];
export type AnalyzeRefreshResponse = Schemas["AnalyzeRefreshResponse"];

export type AnnotationOut = Schemas["AnnotationOut"];
export type AnnotationCreateBody = Schemas["AnnotationCreateBody"];
export type AnnotationUpdateBody = Schemas["AnnotationUpdateBody"];
export type LabelCatalogResponse = Schemas["LabelCatalogResponse"];
export type LabelCatalogEntry = Schemas["LabelCatalogEntry"];
export type ExtractAtBboxBody = Schemas["ExtractAtBboxBody"];
export type ExtractAtBboxResponse = Schemas["ExtractAtBboxResponse"];
export type SnapBboxBody = Schemas["SnapBboxBody"];
export type SnapBboxResponse = Schemas["SnapBboxResponse"];
export type BulkCandidateBody = Schemas["BulkCandidateBody"];
export type BulkCandidateResponse = Schemas["BulkCandidateResponse"];
export type KeyFindingsResponse = Schemas["KeyFindingsResponse"];
export type ManifestResponse = Schemas["ManifestResponse"];

export type FilePageOut = Schemas["FilePageOut"];
export type FilePageOverrideOut = Schemas["FilePageOverrideOut"];
export type ExcludePageBody = Schemas["ExcludePageBody"];
export type RotatePageBody = Schemas["RotatePageBody"];
export type OverridePageTextBody = Schemas["OverridePageTextBody"];
export type ActivePageIdsResponse = Schemas["ActivePageIdsResponse"];

export type SearchRequest =
  Schemas["aidream__api__routers__file_search__SearchRequest"];
export type SearchResponse = Schemas["SearchResponse"];
export type SearchHitOut =
  Schemas["aidream__api__routers__file_search__SearchHitOut"];

export type RegionExtractRequest = Schemas["RegionExtractRequest"];
export type RegionExtractResponse = Schemas["RegionExtractResponse"];

export type RenderRequest = Schemas["RenderRequest"];
export type RenderResponse = Schemas["RenderResponse"];

export type EntityOut = Schemas["EntityOut"];
export type EntityCreateBody = Schemas["EntityCreateBody"];
export type EntityUpdateBody = Schemas["EntityUpdateBody"];
export type FindSimilarBody = Schemas["FindSimilarBody"];
export type FindSimilarResponse = Schemas["FindSimilarResponse"];
export type FindSimilarCandidate = Schemas["FindSimilarCandidate"];

export type ExtractedTextResponse = Schemas["ExtractedTextResponse"];
export type ExtractedTextPageOut = Schemas["ExtractedTextPageOut"];

export type MaskRequestBody = Schemas["MaskRequestBody"];
export type MaskResponse = Schemas["MaskResponse"];
export type RestoreRequestBody = Schemas["RestoreRequestBody"];
export type RestoreResponse =
  Schemas["aidream__api__routers__file_analysis__RestoreResponse"];

type Result<T> = Promise<{ data: T; meta: ResponseMeta }>;
const fid = (id: string) => encodeURIComponent(id);

// ─── Analysis ────────────────────────────────────────────────────────────────

export function getAnalysis(
  fileId: string,
  opts: RequestOptions = {},
): Result<FileAnalysisResponse> {
  return getJson<FileAnalysisResponse>(`/files/${fid(fileId)}/analysis`, opts);
}

export function refreshAnalysis(
  fileId: string,
  body: AnalyzeRefreshBody,
  opts: RequestOptions = {},
): Result<AnalyzeRefreshResponse> {
  return postJson<AnalyzeRefreshResponse, AnalyzeRefreshBody>(
    `/files/${fid(fileId)}/analysis/refresh`,
    body,
    opts,
  );
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export function listPages(
  fileId: string,
  opts: RequestOptions = {},
): Result<FilePageOut[]> {
  return getJson<FilePageOut[]>(`/files/${fid(fileId)}/pages`, opts);
}

export function getActivePageIds(
  fileId: string,
  opts: RequestOptions = {},
): Result<ActivePageIdsResponse> {
  return getJson<ActivePageIdsResponse>(
    `/files/${fid(fileId)}/active-pages`,
    opts,
  );
}

export function getPage(
  fileId: string,
  pageId: string,
  opts: RequestOptions = {},
): Result<FilePageOut> {
  return getJson<FilePageOut>(
    `/files/${fid(fileId)}/pages/${fid(pageId)}`,
    opts,
  );
}

export function excludePage(
  fileId: string,
  pageId: string,
  body: ExcludePageBody,
  opts: RequestOptions = {},
): Result<FilePageOut> {
  return postJson<FilePageOut, ExcludePageBody>(
    `/files/${fid(fileId)}/pages/${fid(pageId)}/exclude`,
    body,
    opts,
  );
}

export function includePage(
  fileId: string,
  pageId: string,
  opts: RequestOptions = {},
): Result<FilePageOut> {
  return postJson<FilePageOut, Record<string, never>>(
    `/files/${fid(fileId)}/pages/${fid(pageId)}/include`,
    {},
    opts,
  );
}

export function rotatePage(
  fileId: string,
  pageId: string,
  body: RotatePageBody,
  opts: RequestOptions = {},
): Result<{ id: string; rotation: number }> {
  return postJson<{ id: string; rotation: number }, RotatePageBody>(
    `/files/${fid(fileId)}/pages/${fid(pageId)}/rotate`,
    body,
    opts,
  );
}

export function overridePageText(
  fileId: string,
  pageId: string,
  body: OverridePageTextBody,
  opts: RequestOptions = {},
): Result<FilePageOverrideOut> {
  return postJson<FilePageOverrideOut, OverridePageTextBody>(
    `/files/${fid(fileId)}/pages/${fid(pageId)}/override-text`,
    body,
    opts,
  );
}

export function listOverrides(
  fileId: string,
  opts: RequestOptions = {},
): Result<FilePageOverrideOut[]> {
  return getJson<FilePageOverrideOut[]>(
    `/files/${fid(fileId)}/overrides`,
    opts,
  );
}

// ─── Annotations ─────────────────────────────────────────────────────────────

export function listAnnotations(
  fileId: string,
  params: {
    labelCategory?: string;
    pageNumber?: number;
    includeRejected?: boolean;
  } = {},
  opts: RequestOptions = {},
): Result<AnnotationOut[]> {
  const qs: string[] = [];
  if (params.labelCategory)
    qs.push(`label_category=${encodeURIComponent(params.labelCategory)}`);
  if (params.pageNumber !== undefined)
    qs.push(`page_number=${params.pageNumber}`);
  if (params.includeRejected) qs.push("include_rejected=true");
  const q = qs.length ? `?${qs.join("&")}` : "";
  return getJson<AnnotationOut[]>(
    `/files/${fid(fileId)}/annotations${q}`,
    opts,
  );
}

export function createAnnotation(
  fileId: string,
  body: AnnotationCreateBody,
  opts: RequestOptions = {},
): Result<AnnotationOut> {
  return postJson<AnnotationOut, AnnotationCreateBody>(
    `/files/${fid(fileId)}/annotations`,
    body,
    opts,
  );
}

export function updateAnnotation(
  fileId: string,
  annotationId: string,
  body: AnnotationUpdateBody,
  opts: RequestOptions = {},
): Result<AnnotationOut> {
  return putJson<AnnotationOut, AnnotationUpdateBody>(
    `/files/${fid(fileId)}/annotations/${fid(annotationId)}`,
    body,
    opts,
  );
}

export function deleteAnnotation(
  fileId: string,
  annotationId: string,
  opts: RequestOptions = {},
): Result<null> {
  return delJson<null>(
    `/files/${fid(fileId)}/annotations/${fid(annotationId)}`,
    opts,
  );
}

export function extractAtBbox(
  fileId: string,
  body: ExtractAtBboxBody,
  opts: RequestOptions = {},
): Result<ExtractAtBboxResponse> {
  return postJson<ExtractAtBboxResponse, ExtractAtBboxBody>(
    `/files/${fid(fileId)}/annotations/extract-at-bbox`,
    body,
    opts,
  );
}

export function snapBbox(
  fileId: string,
  body: SnapBboxBody,
  opts: RequestOptions = {},
): Result<SnapBboxResponse> {
  return postJson<SnapBboxResponse, SnapBboxBody>(
    `/files/${fid(fileId)}/annotations/snap-bbox`,
    body,
    opts,
  );
}

export function bulkFromCandidates(
  fileId: string,
  body: BulkCandidateBody,
  opts: RequestOptions = {},
): Result<BulkCandidateResponse> {
  return postJson<BulkCandidateResponse, BulkCandidateBody>(
    `/files/${fid(fileId)}/annotations/bulk-from-candidates`,
    body,
    opts,
  );
}

export function getKeyFindings(
  fileId: string,
  opts: RequestOptions = {},
): Result<KeyFindingsResponse> {
  return getJson<KeyFindingsResponse>(
    `/files/${fid(fileId)}/key-findings`,
    opts,
  );
}

export function getAnnotationManifest(
  fileId: string,
  opts: RequestOptions = {},
): Result<ManifestResponse> {
  return getJson<ManifestResponse>(
    `/files/${fid(fileId)}/annotations/manifest`,
    opts,
  );
}

// ─── Label catalog ───────────────────────────────────────────────────────────

export function getLabelCatalog(
  opts: RequestOptions = {},
): Result<LabelCatalogResponse> {
  return getJson<LabelCatalogResponse>(`/annotations/label-catalog`, opts);
}

// ─── Entities ────────────────────────────────────────────────────────────────

export function listEntities(
  fileId: string,
  opts: RequestOptions = {},
): Result<EntityOut[]> {
  return getJson<EntityOut[]>(`/files/${fid(fileId)}/entities`, opts);
}

export function createEntity(
  fileId: string,
  body: EntityCreateBody,
  opts: RequestOptions = {},
): Result<EntityOut> {
  return postJson<EntityOut, EntityCreateBody>(
    `/files/${fid(fileId)}/entities`,
    body,
    opts,
  );
}

export function updateEntity(
  fileId: string,
  entityId: string,
  body: EntityUpdateBody,
  opts: RequestOptions = {},
): Result<EntityOut> {
  return putJson<EntityOut, EntityUpdateBody>(
    `/files/${fid(fileId)}/entities/${fid(entityId)}`,
    body,
    opts,
  );
}

export function deleteEntity(
  fileId: string,
  entityId: string,
  opts: RequestOptions = {},
): Result<null> {
  return delJson<null>(`/files/${fid(fileId)}/entities/${fid(entityId)}`, opts);
}

export function findSimilar(
  fileId: string,
  body: FindSimilarBody,
  opts: RequestOptions = {},
): Result<FindSimilarResponse> {
  return postJson<FindSimilarResponse, FindSimilarBody>(
    `/files/${fid(fileId)}/entities/find-similar`,
    body,
    opts,
  );
}

export function promoteAnnotationToEntity(
  fileId: string,
  annotationId: string,
  opts: RequestOptions = {},
): Result<EntityOut> {
  return postJson<EntityOut, Record<string, never>>(
    `/files/${fid(fileId)}/annotations/${fid(annotationId)}/promote-to-entity`,
    {},
    opts,
  );
}

// ─── Search / region / render ───────────────────────────────────────────────

export function searchInFile(
  fileId: string,
  body: SearchRequest,
  opts: RequestOptions = {},
): Result<SearchResponse> {
  return postJson<SearchResponse, SearchRequest>(
    `/files/${fid(fileId)}/search`,
    body,
    opts,
  );
}

export function extractRegion(
  fileId: string,
  body: RegionExtractRequest,
  opts: RequestOptions = {},
): Result<RegionExtractResponse> {
  return postJson<RegionExtractResponse, RegionExtractRequest>(
    `/files/${fid(fileId)}/regions/extract`,
    body,
    opts,
  );
}

export function renderPageWithOverlay(
  fileId: string,
  body: RenderRequest,
  opts: RequestOptions = {},
): Result<RenderResponse> {
  return postJson<RenderResponse, RenderRequest>(
    `/files/${fid(fileId)}/render-page-with-overlay`,
    body,
    opts,
  );
}

// ─── Extracted text (RAG-ready) ─────────────────────────────────────────────

export function getExtractedText(
  fileId: string,
  params: { includeExcluded?: boolean; includeOverrides?: boolean } = {},
  opts: RequestOptions = {},
): Result<ExtractedTextResponse> {
  const qs: string[] = [];
  if (params.includeExcluded) qs.push("include_excluded=true");
  if (params.includeOverrides === false) qs.push("include_overrides=false");
  const q = qs.length ? `?${qs.join("&")}` : "";
  return getJson<ExtractedTextResponse>(
    `/files/${fid(fileId)}/extracted-text${q}`,
    opts,
  );
}

// ─── Reversible redaction ───────────────────────────────────────────────────

export function maskFile(
  fileId: string,
  body: MaskRequestBody,
  opts: RequestOptions = {},
): Result<MaskResponse> {
  return postJson<MaskResponse, MaskRequestBody>(
    `/files/${fid(fileId)}/redact/mask`,
    body,
    opts,
  );
}

export function restoreText(
  body: RestoreRequestBody,
  opts: RequestOptions = {},
): Result<RestoreResponse> {
  return postJson<RestoreResponse, RestoreRequestBody>(
    `/redact/restore`,
    body,
    opts,
  );
}

export function revokeSession(
  sessionId: string,
  opts: RequestOptions = {},
): Result<null> {
  return postJson<null, Record<string, never>>(
    `/redact/sessions/${fid(sessionId)}/revoke`,
    {},
    opts,
  );
}
