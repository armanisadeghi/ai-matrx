/**
 * Surface manifest — Image Uploader (`matrx-user/image-uploader`).
 *
 * Overlay surface for the floating image upload window
 * (`features/window-panels/windows/image/ImageUploaderWindow.tsx`, overlay
 * id `imageUploaderWindow`, multi-instance, ephemeral). A caller spawns it
 * to collect an image (file upload or URL paste), gets the resulting asset
 * variant URLs back via a callback group, and the window closes. Purely an
 * asset-intake widget — no text/content concept, so generic baselines are
 * skipped.
 *
 * Emitter: `<SurfaceRuntimeProvider>` inside `ImageUploaderWindow` — the
 * overlay nesting is deliberate (a nested provider out-depths the page's, so
 * while the window is open ITS scope wins).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const IMAGE_UPLOADER_SURFACE_NAME = "matrx-user/image-uploader";

const groups: SurfaceValueGroup[] = [
  {
    key: "upload_config",
    label: "Upload configuration",
    sortOrder: 100,
    description: "How the opener spawned and configured this upload capture.",
  },
  {
    key: "upload_result",
    label: "Upload result",
    sortOrder: 200,
    description:
      "The outcome of the upload attempt — the produced asset, or the error that stopped it.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Upload configuration ──────────────────────────────────────────────
  {
    name: "window_instance_id",
    label: "Window instance",
    description:
      "Instance id of this uploader window. The overlay is multi-instance, so several uploaders can be open at once; this is the one currently emitting. Always populated while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 290,
    group: "upload_config",
  },
  {
    name: "preset",
    label: "Asset preset",
    description:
      'Asset preset governing the produced variants (e.g. "social"). Always populated while the window is mounted (defaults to "social").',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 300,
    group: "upload_config",
  },
  {
    name: "target_folder",
    label: "Target folder",
    description:
      "Storage folder the opener directed the upload into. Absent when the opener left the preset default.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 310,
    group: "upload_config",
  },
  {
    name: "uploader_title",
    label: "Uploader title",
    description:
      "Window/field title the opener supplied (what the image is FOR, e.g. 'Cover image'). Absent when the opener supplied none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 320,
    group: "upload_config",
  },
  {
    name: "uploader_description",
    label: "Uploader description",
    description:
      "Helper text the opener supplied, shown above the uploader. Absent when the opener supplied none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 330,
    group: "upload_config",
  },
  {
    name: "current_url",
    label: "Current image URL",
    description:
      "URL of the image currently occupying the slot being replaced (the 'before' image). Absent when the slot is empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 340,
    group: "upload_config",
  },
  {
    name: "allow_url_paste",
    label: "URL paste allowed",
    description:
      "True when the user may paste an image URL instead of uploading a file. Always populated while the window is mounted (defaults true).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "upload_config",
  },

  // ── Upload result ─────────────────────────────────────────────────────
  {
    name: "has_upload_result",
    label: "Has upload result",
    description:
      "True once an image has been uploaded (or pasted) in this window and a result is pending hand-back. Always populated while the window is mounted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "upload_result",
  },
  {
    name: "result_primary_url",
    label: "Result primary URL",
    description:
      "Primary variant URL of the uploaded asset. Absent until an upload completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 410,
    group: "upload_result",
  },
  {
    name: "result_file_id",
    label: "Result file id",
    description:
      "cld_files UUID of the uploaded asset, for looking the file up elsewhere. Absent until an upload completes, and also absent for a CORS-blocked pasted URL (which is used directly and never becomes a cloud file).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "upload_result",
  },
  {
    name: "result_variant_urls",
    label: "Result variant URLs",
    description:
      "Map of every produced variant key (original, og_url, thumbnail_url, …) to its URL, as generated for the active preset. Absent until an upload completes; holds only `original` for a pasted URL that could not be fetched.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 430,
    group: "upload_result",
  },
  {
    name: "last_error",
    label: "Last upload error",
    description:
      "Message from the most recent failed upload attempt in this window. Absent when nothing has failed, and cleared as soon as a later attempt succeeds.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 440,
    group: "upload_result",
  },
];

export const imageUploaderManifest: SurfaceManifest = {
  surfaceName: IMAGE_UPLOADER_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired in ImageUploaderWindow and verified live. Gap: the in-flight upload status (idle/uploading/success), the name of the file being uploaded, and the URL-paste draft live inside the shared `ImageAssetUploader` official component (17 callers) and are not handed up to the window, so they are neither declared nor emitted.",
  overlayId: "imageUploaderWindow",
  label: "Image Uploader",
  intro: `<surface_intro>
You are in the floating Image Uploader window — an ephemeral asset-intake surface a caller spawned to collect one image (file upload or URL paste) and hand its variant URLs back. Upload configuration tells you what the image is for and how it will be processed; Upload result carries the produced asset once an upload has completed. There is no text content here.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Asset-intake widget — no text/content/selection concept.
  skipBaselineValues: true,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createImageUploaderScope(values: {
  window_instance_id: string;
  preset: string;
  allow_url_paste: boolean;
  has_upload_result: boolean;
  target_folder?: string;
  uploader_title?: string;
  uploader_description?: string;
  current_url?: string;
  result_primary_url?: string;
  result_file_id?: string;
  result_variant_urls?: Record<string, string>;
  last_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
