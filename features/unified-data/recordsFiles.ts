/**
 * A VALUE KEPT AS A FILE, OPENED AND READ THROUGH THE APP'S OWN FILE ROUTES (BIG-VALUES-TAILS).
 *
 * The record store keeps a value too big for one cell as a file and the cell holds its first
 * words (`@ai-matrx/records/core` `wholeValueOf`). records-ui asks its host two things about that
 * file, and this module is the platform's one answer, bound by every RecordsMount that shows data:
 *
 *   hrefForFile   where the file opens: the single-file page `/files/f/<id>`, whose server check
 *                 decides access for the person reading (never the table's organization).
 *   readFileText  the file's whole text, so an export writes the whole value: the files API's
 *                 download (`/files/<id>/download`) with the person's own session. A read that
 *                 fails REJECTS with a sentence naming the file — the export then says where the
 *                 whole text is, never passing the first words off as the value.
 */
import { downloadFile } from "@/features/files/api/files";

export function hrefForFile({ fileId }: { fileId: string }): string {
  return `/files/f/${encodeURIComponent(fileId)}`;
}

export async function readFileText({ fileId }: { fileId: string }): Promise<string> {
  let blob: Blob;
  try {
    ({ blob } = await downloadFile(fileId));
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`The whole text is in file ${fileId}, and it could not be read: ${why}`, { cause });
  }
  return await blob.text();
}

/** The two host ports, as one object to spread into a RecordsMount host. */
export const RECORDS_FILES = { hrefForFile, readFileText };
