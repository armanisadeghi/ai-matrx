/**
 * Surface manifest — File (`matrx-user/file`).
 *
 * ONE file, worked on: the dedicated single-file page `/files/f/[fileId]`
 * (`SingleFileShell`) and a File tile on a Board (`features/spatial/items/
 * work-items.tsx`). Both mount the SAME host —
 * `features/files/components/surfaces/single-file/SingleFileSurfaceHost.tsx` —
 * around the same body (`FileTabsBody`: Preview / Edit / Knowledge / Analysis /
 * Share / Info / Versions), so an agent can do in a Board tile exactly what it
 * can do on the file's page.
 *
 * Why a surface of its own (not `matrx-user/files`, not `matrx-user/file-preview`):
 *   - `matrx-user/files` is the BROWSER (sections, folders, search, list rows);
 *     none of its list values or list writes exist on a one-file page.
 *   - `matrx-user/file-preview` is the floating preview WINDOW
 *     (`overlayId: filePreviewWindow`) around the side-panel `PreviewPane`
 *     (two tabs, values-only). Its identity is the overlay; folding the page and
 *     the tile into it would make an overlay surface answer for two non-overlay
 *     hosts.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md): no signed URL and no
 * storage path is ever declared or emitted. The file is identified by its
 * durable `file_id`; bytes are fetched from that id.
 *
 * WRITE HALF — every write drives the file feature's own action bundle
 * (`useFileActions`: `renameFile` / `moveFile` / `updateFileMetadata` /
 * `restoreVersion`, or the virtual-source `*Any` thunks), the same calls the
 * Rename dialog, the Move picker, the Share tab and the Versions tab make.
 * All four persist, so all four ASK. Moving and changing visibility are the
 * same actions the person can take from the file's own menu and Share tab; the
 * approval card is the gate, exactly as it is for the rename.
 *
 * CLIENT TOOLS — imperative one-shots in the viewer itself: open a tab, go to a
 * page, download a copy. Client-only, instantly visible, undone by one click on
 * the tab strip / page control.
 */

import type {
  SurfaceClientTool,
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const FILE_SURFACE_NAME = "matrx-user/file";

/** The seven tabs of `FileTabsBody`, by their stable ids. */
export const FILE_SURFACE_TABS = [
  "preview",
  "edit",
  "document",
  "analysis",
  "share",
  "info",
  "versions",
] as const;

/** `Visibility` in `features/files/types.ts` — the four Share-tab options. */
export const FILE_SURFACE_VISIBILITIES = [
  "personal",
  "internal",
  "link",
  "public",
] as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "file_identity",
    label: "File identity",
    sortOrder: 100,
    description: "Which file this is: durable id, name, type, size, dates.",
  },
  {
    key: "file_location",
    label: "File location",
    sortOrder: 200,
    description: "The folder the file lives in.",
  },
  {
    key: "file_access",
    label: "File access",
    sortOrder: 300,
    description: "Who can see the file: visibility, ownership, share links, grants.",
  },
  {
    key: "file_history",
    label: "File history",
    sortOrder: 400,
    description: "The file's versions.",
  },
  {
    key: "file_knowledge",
    label: "File knowledge",
    sortOrder: 500,
    description: "Whether the file's text has been extracted into Knowledge.",
  },
  {
    key: "viewer_state",
    label: "Viewer state",
    sortOrder: 600,
    description: "Where the person is inside the viewer: open tab, current page.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity ──────────────────────────────────────────────────────────
  {
    name: "file_id",
    label: "File ID",
    description:
      "Durable files.files UUID of the file. Always present — the host never mounts without one. Use it with the platform's file tools to read the file's bytes or text.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "file_identity",
    sortOrder: 300,
  },
  {
    name: "file_name",
    label: "File name",
    description:
      "The file's name including its extension. Absent for a moment right after the file opens, until its record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "file_identity",
    sortOrder: 310,
  },
  {
    name: "file_mime_type",
    label: "File type",
    description:
      "MIME type of the file (e.g. application/pdf). Absent until the record loads or when no type was recorded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "file_identity",
    sortOrder: 320,
  },
  {
    name: "file_preview_kind",
    label: "Preview kind",
    description:
      "How the viewer renders this file: pdf, image, video, audio, markdown, code, data, text, html, svg or generic. Decides which tabs can do real work (Edit is text-shaped kinds; pages exist only for pdf). Absent until the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "file_identity",
    sortOrder: 325,
  },
  {
    name: "file_size_bytes",
    label: "File size",
    description: "Size of the file in bytes. Absent until the record loads or when unrecorded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "file_identity",
    sortOrder: 330,
  },
  {
    name: "file_created_at",
    label: "Created at",
    description: "ISO timestamp the file was created. Absent until the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "file_identity",
    sortOrder: 340,
  },
  {
    name: "file_updated_at",
    label: "Updated at",
    description: "ISO timestamp the file was last changed. Absent until the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "file_identity",
    sortOrder: 345,
  },
  {
    name: "file_is_virtual",
    label: "Virtual file",
    description:
      "True when this row is a virtual-source record (a note, a code file…) shown through Files rather than a stored cloud file. Visibility and version writes are refused for virtual rows. Absent until the record loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "file_identity",
    sortOrder: 350,
  },
  {
    name: "file_summary",
    label: "File summary",
    description:
      "One object with the file's facts in a single read: id, name, mime_type, preview_kind, size, folder_id, folder_path, visibility, is_owner, current_version, created_at, updated_at. Absent until the record loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 420,
    autoContext: false,
    group: "file_identity",
    sortOrder: 360,
  },

  // ── Location ──────────────────────────────────────────────────────────
  {
    name: "file_folder_id",
    label: "Folder ID",
    description:
      "UUID of the folder the file is in, or null when it sits at the top level of the person's files. Absent until the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "file_location",
    sortOrder: 300,
  },
  {
    name: "file_folder_path",
    label: "Folder path",
    description:
      "Slash-joined path of the file's folder (e.g. \"Clients/Acme/Contracts\"); empty at the top level. Absent until the record and its folder load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "file_location",
    sortOrder: 310,
  },

  // ── Access ────────────────────────────────────────────────────────────
  {
    name: "file_visibility",
    label: "Visibility",
    description:
      "Who can find the file by default: personal (only the owner and explicit grantees), internal (everyone in the owning organization), link (anyone holding a share link) or public. Absent until the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "file_access",
    sortOrder: 300,
  },
  {
    name: "file_is_owner",
    label: "You own this file",
    description:
      "True when the signed-in person owns the file. Only the owner can change visibility. Absent until the record loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "file_access",
    sortOrder: 310,
  },
  {
    name: "file_share_links",
    label: "Share links",
    description:
      "Active share links for the file: [{ id, permission_level, expires_at, use_count }]. Tokens are never included. Present once the Share tab (or a copy-link action) has loaded them; absent before.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 240,
    autoContext: false,
    group: "file_access",
    sortOrder: 320,
  },
  {
    name: "file_grants",
    label: "People and groups",
    description:
      "Explicit access grants on the file: [{ grantee_type, grantee_id, permission_level }]. Present once the Share tab has loaded them; absent before.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 240,
    autoContext: false,
    group: "file_access",
    sortOrder: 330,
  },

  // ── History ───────────────────────────────────────────────────────────
  {
    name: "file_current_version",
    label: "Current version",
    description: "The file's current version number (1 for a file never replaced). Absent until the record loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "file_history",
    sortOrder: 300,
  },
  {
    name: "file_versions",
    label: "Versions",
    description:
      "Earlier versions: [{ version_number, size, created_at, change_summary }]. Present once the Versions tab has loaded them; absent before.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    group: "file_history",
    sortOrder: 310,
  },

  // ── Knowledge ─────────────────────────────────────────────────────────
  {
    name: "file_knowledge_status",
    label: "Knowledge status",
    description:
      "Whether the file's text is extracted into Knowledge: indexed, pending, not_indexed or unknown. Absent when the status was never fetched this session.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "file_knowledge",
    sortOrder: 300,
  },
  {
    name: "file_knowledge_document",
    label: "Knowledge document",
    description:
      "The processed Knowledge document for this file: { processed_document_id, total_pages, has_clean_content, updated_at }. The extracted text itself is read with the Knowledge tools from processed_document_id. Null when the file was never processed; absent when the lookup could not run.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "file_knowledge",
    sortOrder: 310,
  },

  // ── Viewer state ──────────────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Open tab",
    description:
      "The viewer tab the person has open: preview, edit, document (shown as Knowledge), analysis, share, info or versions. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "viewer_state",
    sortOrder: 300,
  },
  {
    name: "page_number",
    label: "Current page",
    description:
      "1-based page the Preview tab is on, for paginated files (PDFs). Absent for other kinds and before a page has been turned or requested.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "viewer_state",
    sortOrder: 310,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "file_name",
    label: "File name",
    description:
      'Renames the file, immediately, through the same path as the Rename dialog. Value: the COMPLETE new name INCLUDING its extension (e.g. "q3-budget-review.pdf"). Rejected, with the reason returned, when the name is empty, contains \'/\' \'\\\' or control characters, ends with \'.\', is unchanged, drops or changes the extension, or matches another file or folder in the same folder; also while the files listing is still loading or an upload is running.',
    valueType: "string",
    updatesValue: "file_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "file_identity",
    sortOrder: 315,
  },
  {
    name: "file_folder_id",
    label: "Move to folder",
    description:
      "Moves the file into another folder, immediately, through the same move the Move picker performs. Value: the UUID of a folder the person has (from the files listing), or null to move it to the top level. Refused for an unknown or deleted folder, a virtual folder, or the folder it is already in. Only the location changes — the name, bytes and access stay the same.",
    valueType: "string",
    updatesValue: "file_folder_id",
    mode: "entity",
    applyPolicy: "ask",
    group: "file_location",
    sortOrder: 305,
  },
  {
    name: "file_visibility",
    label: "Visibility",
    description:
      'Changes who can find the file by default, exactly as the Share tab\'s Visibility options do. Value: exactly "personal", "internal", "link" or "public". "public" makes the file readable by anyone with its address — say so when you propose it. Refused when the person does not own the file, for virtual rows, and when the value is already set.',
    valueType: "string",
    updatesValue: "file_visibility",
    mode: "entity",
    applyPolicy: "ask",
    group: "file_access",
    sortOrder: 305,
  },
  {
    name: "file_restore_version",
    label: "Restore version",
    description:
      "Restores an earlier version as the file's current content, exactly as Restore on the Versions tab does; the replaced content stays in the history as its own version. Value: the version_number to restore (a number below file_current_version). Refused for virtual rows, the current version, or a number that does not exist.",
    valueType: "number",
    updatesValue: "file_current_version",
    mode: "entity",
    applyPolicy: "ask",
    group: "file_history",
    sortOrder: 305,
  },
];

const clientTools: SurfaceClientTool[] = [
  {
    name: "file_open_tab",
    label: "Open tab",
    description:
      'Switches the file viewer to one of its tabs so the person can SEE what you are talking about: "preview" (the file itself), "edit" (edit text-shaped files), "document" (the Knowledge view: extracted pages and cleaned text), "analysis" (AI analysis), "share" (visibility, links, people), "info" (details) or "versions" (history). Returns the tab now open. Changes nothing about the file.',
    inputSchema: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          enum: [...FILE_SURFACE_TABS],
          description: "The tab to open.",
        },
      },
      required: ["tab"],
    },
    mode: "ui",
  },
  {
    name: "file_go_to_page",
    label: "Go to page",
    description:
      "Shows a page of a paginated file (PDF) in the Preview tab, opening that tab if needed. Takes `page`, a 1-based page number. Refused for files that have no pages (anything but a PDF). Changes nothing about the file.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "integer",
          minimum: 1,
          description: "1-based page number.",
        },
      },
      required: ["page"],
    },
    mode: "ui",
  },
  {
    name: "file_download",
    label: "Download",
    description:
      "Saves a copy of the file to the person's computer, exactly as the Download button does. Takes no arguments. Refused for virtual rows, which have no stored bytes. Changes nothing about the file.",
    inputSchema: { type: "object", properties: {}, required: [] },
    mode: "ui",
  },
];

export const fileManifest: SurfaceManifest = {
  surfaceName: FILE_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description: "One file, worked on: its page and its Board tile",
  readiness: "partial",
  readinessNote:
    "Desktop page and Board tile mount the shared host (values, four entity write targets, three client tools). Mobile /files/f renders MobileStack, which does not mount this host. The extracted text itself is not emitted — agents read it from file_knowledge_document through the Knowledge tools. Full S1–S18 certification not run.",
  label: "File",
  urlPattern: "/files/f/[fileId]",
  intro: `<surface_intro>
You are on ONE file the person is working on — its own page, or a File tile on their Board.
The viewer has seven tabs: Preview (the file itself), Edit (text-shaped files), Knowledge
(shown as "document": extracted pages and cleaned text), Analysis, Share (visibility, links,
people), Info and Versions. active_tab says which one is open; page_number which PDF page.

Read the values in layers: identity (file_id, file_name, file_mime_type, file_preview_kind,
file_size_bytes), location (file_folder_id, file_folder_path), access (file_visibility,
file_is_owner, share links and grants once loaded), history (file_current_version, versions),
and knowledge (file_knowledge_status, file_knowledge_document).

The file is identified by its durable file_id — never a URL. Its bytes and text are not in
this context: read them by file_id with the file tools, or from
file_knowledge_document.processed_document_id with the Knowledge tools.

Renaming, moving, changing visibility and restoring a version are write targets and ask the
person first. Opening a tab, going to a page and downloading are client tools that act
immediately and change nothing about the file.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  // Which record, at a glance.
  briefValues: ["file_name", "file_mime_type", "file_size_bytes", "file_updated_at"],
  writeTargets,
  clientTools,
};

export type FileSurfaceTab = (typeof FILE_SURFACE_TABS)[number];

/**
 * Type-safe payload — required keys mirror every `alwaysAvailable: true`
 * value above; optional keys mirror the rest.
 */
export function createFileScope(values: {
  file_id: string;
  active_tab: FileSurfaceTab;
  file_name?: string;
  file_mime_type?: string;
  file_preview_kind?: string;
  file_size_bytes?: number;
  file_created_at?: string;
  file_updated_at?: string;
  file_is_virtual?: boolean;
  file_summary?: Record<string, unknown>;
  file_folder_id?: string | null;
  file_folder_path?: string;
  file_visibility?: string;
  file_is_owner?: boolean;
  file_share_links?: Array<Record<string, unknown>>;
  file_grants?: Array<Record<string, unknown>>;
  file_current_version?: number;
  file_versions?: Array<Record<string, unknown>>;
  file_knowledge_status?: string;
  file_knowledge_document?: Record<string, unknown> | null;
  page_number?: number;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
