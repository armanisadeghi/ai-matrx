/**
 * Surface manifest — Markdown Studio (`matrx-user/markdown-studio`).
 *
 * The full-page markdown workspace at `/markdown-studio`: one content buffer
 * shared by two modes — Studio (editor + live preview, side by side) and
 * Analysis (parser-drift report) — with a personal sample library the user
 * saves to, updates, and forks.
 *
 * NOT the same surface as `matrx-user/markdown-editor`, which is the floating
 * Markdown Editor overlay window driving the classification pipeline. Same
 * medium, different place and different agents.
 *
 * Emitter: `components/markdown-studio/MarkdownStudio.tsx` mounts
 * `<SurfaceRuntimeProvider>` with `createMarkdownStudioScope` — live buffer,
 * library link, dirty/save state, and view mode at trigger time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "document_identity",
    label: "Document identity",
    sortOrder: 100,
    description:
      "Which library sample (if any) the buffer came from and how it is labelled.",
  },
  {
    key: "document_content",
    label: "Document content",
    sortOrder: 200,
    description: "The markdown buffer itself and what the parser finds in it.",
  },
  {
    key: "save_state",
    label: "Save state",
    sortOrder: 300,
    description:
      "Whether the buffer diverges from its saved sample and whether a save is in flight.",
  },
  {
    key: "studio_view",
    label: "Studio view",
    sortOrder: 400,
    description: "Which mode the workspace is showing and what the library holds.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity ────────────────────────────────────────────────────────
  {
    name: "sample_id",
    label: "Loaded sample id",
    description:
      "UUID of the user's saved markdown sample the buffer was loaded from. Empty when the buffer is unsaved, cleared, or came from a built-in template.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "document_identity",
  },
  {
    name: "sample_name",
    label: "Loaded sample name",
    description:
      "Name of the loaded library sample, or the title of the built-in template last inserted. Empty when the buffer has no origin.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "document_identity",
  },
  {
    name: "document_label",
    label: "Document label",
    description:
      "The label shown in the status strip — the sample name, else \"Untitled\" for unsaved content, else \"Empty\". Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "document_identity",
  },
  {
    name: "is_from_library",
    label: "From library",
    description:
      "True when the buffer is linked to one of the user's saved samples (so saving updates it in place rather than creating a new one). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "document_identity",
  },

  // ── Content ─────────────────────────────────────────────────────────
  {
    name: "content",
    label: "Primary content",
    description:
      "The full markdown source in the studio buffer — the same text the editor pane, the preview, and the analysis view all read. Always present; empty string when the buffer is cleared.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    sortOrder: 200,
    group: "document_content",
  },
  {
    name: "detected_blocks",
    label: "Detected render blocks",
    description:
      "Render-block types detected in the current buffer (code fences, tables, custom blocks) — the same detection stored with a saved sample. Empty array when the buffer holds none.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 150,
    sortOrder: 340,
    group: "document_content",
  },

  // ── Save state ──────────────────────────────────────────────────────
  {
    name: "is_dirty",
    label: "Unsaved changes",
    description:
      "True when the buffer differs from the loaded sample, or when there is content with no sample behind it. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "save_state",
  },
  {
    name: "is_saving",
    label: "Save in flight",
    description:
      "True while a save, update, or fork request to the sample library is in flight. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "save_state",
  },

  // ── View ────────────────────────────────────────────────────────────
  {
    name: "view_mode",
    label: "View mode",
    description:
      "Which mode the workspace is in — \"studio\" (editor beside live preview) or \"analysis\" (parser-drift report). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 370,
    group: "studio_view",
  },
  {
    name: "library_sample_count",
    label: "Library size",
    description:
      "How many markdown samples the user has saved to their personal library. Always present; 0 when the library is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 380,
    group: "studio_view",
  },
];

export const markdownStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/markdown-studio",
  readiness: "verified",
  label: "Markdown Studio",
  urlPattern: "/markdown-studio",
  intro: `<surface_intro>
You are on Markdown Studio — a full-page markdown workspace. The user writes or pastes markdown into one buffer (content) and views it two ways: "studio" mode puts the editor beside a live rendered preview, "analysis" mode reports how the platform's parser reads the same text. view_mode tells you which they are looking at.
The buffer can be linked to one of the user's saved samples (sample_id / sample_name / is_from_library); is_dirty says whether it has diverged from that saved copy. detected_blocks lists the render-block types the parser found.
When asked to write, fix, or transform text here, operate on content and return valid markdown — the preview and the analysis view both parse whatever you produce.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createMarkdownStudioScope(values: {
  content: string;
  document_label: string;
  is_from_library: boolean;
  detected_blocks: string[];
  is_dirty: boolean;
  is_saving: boolean;
  view_mode: string;
  library_sample_count: number;
  sample_id?: string;
  sample_name?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
