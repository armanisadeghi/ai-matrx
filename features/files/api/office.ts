/**
 * features/files/api/office.ts
 *
 * Office (docx / pptx / xlsx) server-side read endpoints on aidream — the
 * matrx-files Office codec exposed over HTTP. Powers the OfficePreview
 * previewer (extract → markdown) and the "Convert to PDF" file action.
 *
 * Backend: aidream/api/routers/office_generation.py (`/office/*`).
 */

import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

/** Markdown view of an existing Office file (whole doc + per-portion). */
export type OfficeExtraction =
  components["schemas"]["OfficeExtractionResponse"];
/** One slide / sheet / section of an extracted document. */
export type OfficePortion = components["schemas"]["OfficePortionOut"];
/** FileRef for a generated / converted Office asset. */
export type OfficeFileRef = components["schemas"]["OfficeGenerationResponse"];

/**
 * Extract an Office file the caller can read into markdown + portions.
 * The server does the parsing (incl. the LibreOffice legacy bridge for
 * .doc/.ppt) — the bytes never reach the browser.
 */
export async function extractOfficeMarkdown(
  fileId: string,
): Promise<OfficeExtraction> {
  const { data } = await apiGet(
    buildPath("/office/{file_id}/markdown", { file_id: fileId }),
  );
  return data;
}

/**
 * Render an Office file to PDF server-side (LibreOffice). Returns the NEW
 * pdf file's FileRef — callers typically navigate to `/files/f/{file_id}`.
 */
export async function convertOfficeToPdf(
  fileId: string,
): Promise<OfficeFileRef> {
  const { data } = await apiPost(
    buildPath("/office/{file_id}/convert", { file_id: fileId }),
    { target: "pdf" },
  );
  return data;
}
