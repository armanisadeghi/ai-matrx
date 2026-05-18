/**
 * Shared types for the four Image Studio modes (Convert, Edit, Annotate, Avatar).
 *
 * Every mode follows the same lifecycle:
 *   1. Receive a source (File, URL, or cloud_file_id).
 *   2. Let the user manipulate it.
 *   3. On Save, upload the result via the universal handler (with
 *      `createShareLink: true`) and report back with the new cloud
 *      file id + share URL.
 *
 * Modes are mounted from full-page routes AND from modal dialogs (e.g. Notes
 * "edit this image" → opens Edit mode in a modal). Both call paths use the
 * same shell component — the routes pass `presentation="page"`, the modals
 * pass `presentation="modal"`.
 */

export type ModePresentation = "page" | "modal";

/**
 * The three ways a mode can be handed an image to work on.
 *
 * - `file`: a freshly-picked File from the OS file picker or drop zone.
 * - `url`: an absolute URL the browser can fetch (e.g. share URL,
 *   public S3 URL, AI generation result before save).
 * - `cloudFileId`: an id in the `cloud_files` table — the mode will resolve
 *   it to a public URL and load via the standard cloud-files render path.
 */
export type ImageSource =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string; suggestedFilename?: string }
  | { kind: "cloudFileId"; cloudFileId: string };

export interface SaveResult {
  /** New cloud file id created by the save. */
  fileId: string;
  /** Persistent share URL for the saved file. */
  shareUrl: string;
  /** Final filename of the saved file. */
  filename: string;
}

export interface ModeShellProps {
  source: ImageSource | null;
  /**
   * Optional cloud-file id for AI ops, when the caller has already resolved
   * `source` to a `url` (e.g. file-viewer Edit tab passes a `useFileSrc`-
   * resolved URL but still wants Remove BG / Upscale / AI edit to work).
   * The shell prefers this when set; otherwise it falls back to reading the
   * id from `source.kind === "cloudFileId"`.
   */
  cloudFileId?: string | null;
  /** Where the result should be filed in the cloud library. */
  defaultFolder?: string;
  /** Page vs modal presentation. */
  presentation?: ModePresentation;
  /** Called after a successful save. */
  onSave?: (result: SaveResult) => void;
  /** Called when the user cancels (modal mode). */
  onCancel?: () => void;
}
