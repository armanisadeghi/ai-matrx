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
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";

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

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"];

/** A native `accept` list ("image/*,.pdf") as the picker's extension filter; empty = every file. */
export function extensionsFromAccept(accept: string | undefined): string[] {
  if (!accept) return [];
  const out = new Set<string>();
  for (const raw of accept.split(",")) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (token.startsWith(".")) out.add(token.slice(1));
    else if (token === "image/*") IMAGE_EXTENSIONS.forEach((e) => out.add(e));
    else if (token === "application/pdf") out.add("pdf");
    else return []; // a type the picker cannot filter by: offer every file rather than hide some
  }
  return [...out];
}

/**
 *   pickFiles     an attachment cell's "Attach files…": the app's ONE file window (the canonical
 *                 FilesResourcePicker in its non-blocking window, multi-pick footer "Attach N
 *                 files"). Resolves the chosen file ids — the store turns each into its kernel
 *                 File record at the write door — or null when the person closed the window.
 */
export async function pickFiles({ multiple, accept }: { multiple: boolean; accept?: string }): Promise<string[] | null> {
  const allowedExtensions = extensionsFromAccept(accept);
  const picked = await openFilePicker({
    multi: multiple,
    title: multiple ? "Attach files" : "Attach a file",
    ...(allowedExtensions.length > 0 ? { allowedExtensions } : {}),
  });
  return picked && picked.length > 0 ? picked : null;
}

/** The host's file ports, as one object to spread into a RecordsMount host. */
export const RECORDS_FILES = { hrefForFile, readFileText, pickFiles };
