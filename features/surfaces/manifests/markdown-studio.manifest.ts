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
  SurfaceWriteTarget,
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

/**
 * Write half of the 360 loop — what an agent may WRITE into the studio.
 *
 * The judgment bar, applied honestly to this surface: the markdown buffer IS
 * the surface. A document an agent drafts, restructures, tightens or extends
 * is the textbook YES case, so `content` gets BOTH write shapes — a full
 * replacement and an append — for the same reason `agent-builder` splits
 * `system_instruction` / `append_system_instruction`: adding a section to a
 * 10KB document should not require the agent to re-send the 10KB.
 *
 * `view_mode` is the one judgment call worth writing down. It very nearly
 * failed the "pure-mechanical toggle nobody would ask an agent to flip" test —
 * but the two modes are not decoration here: "analysis" is the parser-drift
 * report, and "restructure this and show me how the parser reads it" is a real
 * single-message ask that ends in a mode switch. It is declared `mode: "ui"`
 * (ephemeral, nothing to save) yet kept on `applyPolicy: "ask"` rather than
 * `auto`, because the switch swaps the entire body of the page out from under
 * the user; the in-place confirm costs one click and keeps ONE consent model
 * across every target on this surface.
 *
 * Deliberately NOT here, and must stay that way: saving to the sample library
 * (`create` / `update` mint and overwrite the user's own records — file
 * management, not drafting), `sample_id` / `sample_name` / `is_from_library`
 * (identity and ownership of the file behind the buffer), and `is_saving`.
 * `document_label`, `detected_blocks`, `is_dirty` and `library_sample_count`
 * are DERIVED read values with no independent write path — an agent changes
 * them by writing `content`, never directly. Clearing the buffer stays a human
 * gesture (the editor's Clear button); an empty string is refused.
 *
 * Both content targets are `mode: "draft"`: the value lands through the SAME
 * `setContent` the user's own typing goes through, so `is_dirty` re-derives
 * itself and the header's Save/Update action stays honest. Nothing reaches the
 * library until the user presses Save. Handlers live on the studio's own
 * provider in `components/markdown-studio/MarkdownStudio.tsx`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "document_content",
    label: "Primary content",
    description:
      "REPLACES the entire markdown buffer with the string you pass — the text lands in the editor pane exactly as written, and the live preview and analysis view re-parse it immediately. This is a full replacement, not a merge: read `content` first and include everything you want kept, or use `append_document_content` instead when you only mean to add. Must be non-empty markdown; clearing the studio is a human action, so an empty string is refused. Staged as unsaved changes — the user reviews and saves to their library.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "document_content",
    sortOrder: 100,
  },
  {
    name: "append_document_content",
    label: "Added content",
    description:
      "APPENDS the string you pass to the end of the current markdown buffer, separated by a blank line. Nothing already in the document is touched or re-sent — pass only the new text. Use this to add a section, an example, or a closing paragraph; use `document_content` when the whole document is being rewritten. Must be non-empty markdown. Staged as unsaved changes — the user reviews and saves to their library.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "document_content",
    sortOrder: 110,
  },
  {
    name: "view_mode",
    label: "View mode",
    description:
      'Switches which mode the workspace shows. Exactly one of "studio" (editor beside the live rendered preview) or "analysis" (the parser-drift report for the same buffer) — any other value is refused. Ephemeral view state only: the buffer is untouched and there is nothing to save. Use it when the user asks to SEE the document a particular way, not as a step in writing one.',
    valueType: "string",
    updatesValue: "view_mode",
    mode: "ui",
    applyPolicy: "ask",
    group: "studio_view",
    sortOrder: 120,
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
  writeTargets,
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
