/**
 * Surface manifest — File Preview (`matrx-user/file-preview`).
 *
 * Overlay surface for the floating file preview window
 * (`features/window-panels/windows/cloud-files/FilePreviewWindow.tsx`,
 * overlay id `filePreviewWindow`) — the same canonical `PreviewPane` users
 * see on `/files`, in a draggable window. The window never renders without a
 * file id, so file identity is guaranteed while the surface exists. File
 * metadata comes from the cloud-files Redux row, which is hydrated on demand
 * (`useEnsureCloudFile`) — metadata values may be briefly absent right after
 * open. The surface only exists while the window is open.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const FILE_PREVIEW_SURFACE_NAME = "matrx-user/file-preview";

const groups: SurfaceValueGroup[] = [
  {
    key: "file_identity",
    label: "File identity",
    sortOrder: 100,
    description: "The file being previewed: canonical id + metadata.",
  },
  {
    key: "preview_state",
    label: "Preview state",
    sortOrder: 200,
    description: "Where the user is inside the preview (page position).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── File identity ─────────────────────────────────────────────────────
  {
    name: "file_id",
    label: "File ID",
    description:
      "Canonical files.files UUID of the file being previewed. Always present — the window refuses to render without one.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "file_identity",
  },
  {
    name: "file_name",
    label: "File name",
    description:
      "Display name of the previewed file from the cloud-files store. Absent for a moment right after open until the row hydrates.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "file_identity",
  },
  {
    name: "file_mime_type",
    label: "File MIME type",
    description:
      "MIME type of the previewed file (e.g. application/pdf). Absent until the cloud-files row hydrates or when the file has no recorded type.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 320,
    group: "file_identity",
  },
  {
    name: "file_size_bytes",
    label: "File size (bytes)",
    description:
      "Size of the previewed file in bytes. Absent until the cloud-files row hydrates or when the size is unrecorded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
    group: "file_identity",
  },
  {
    name: "file_visibility",
    label: "File visibility",
    description:
      "Visibility of the previewed file (public / personal / shared). Absent until the cloud-files row hydrates.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 340,
    group: "file_identity",
  },

  // ── Preview state ─────────────────────────────────────────────────────
  {
    name: "page_number",
    label: "Current page",
    description:
      "1-based page the preview is on, for paginated files (PDFs). Absent for non-paginated files or when no page has been requested/turned yet.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "preview_state",
  },
];

export const filePreviewManifest: SurfaceManifest = {
  surfaceName: FILE_PREVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Window-held state (file id, page, hydrated metadata) audited and emitted; PreviewPane internals (active tab, versions, extracted text content) are not emitted",
  overlayId: "filePreviewWindow",
  label: "File Preview",
  intro: `<surface_intro>
You are in the floating File Preview window — the same canonical preview surface users get on /files, showing one cloud file (document, image, PDF, media) with tabs for preview and versions. File identity gives you the canonical file id (always present) plus its metadata once the store row hydrates; Preview state tells you which page the user is on for paginated files. The file's byte content is not emitted — resolve it through the file id via the platform's file tools when needed.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // The previewed document's text is a real content concept, but the window
    // does not hold it — baselines stay declared (injected) and unemitted;
    // agents resolve content from `file_id`.
    pickBaseline("context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createFilePreviewScope(values: {
  file_id: string;
  file_name?: string;
  file_mime_type?: string;
  file_size_bytes?: number;
  file_visibility?: string;
  page_number?: number;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
