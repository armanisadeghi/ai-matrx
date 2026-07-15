import { apiPost, buildPath } from "@/lib/api/typed-client";
import type { RequestOptions, ResponseMeta } from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";

// Types DERIVED from the OpenAPI contract — never hand-mirrored. A backend
// rename lights up every callsite in the same `pnpm sync-types` PR.
export type PdfPageRange = components["schemas"]["PdfPageRange"];
export type PdfPageSelectionRequest = components["schemas"]["PdfPageSelectionRequest"];
export type PdfOutputPageMap = components["schemas"]["PdfOutputPageMap"];
export type SelectedPdfFileRef = components["schemas"]["FileRef"];
export type PdfPageSelectionResult = components["schemas"]["PdfPageSelectionResult"];

/** Build or reuse one PDF containing only the requested physical source pages. */
export function selectPdfPages(
  fileId: string,
  request: PdfPageSelectionRequest,
  opts: RequestOptions = {},
): Promise<{ data: PdfPageSelectionResult; meta: ResponseMeta }> {
  return apiPost(
    buildPath("/files/{file_id}/pdf-pages", { file_id: fileId }),
    request,
    opts,
  );
}
