/**
 * Surface manifest — Markdown Editor (`matrx-user/markdown-editor`).
 *
 * The floating Markdown Editor window (overlay `markdownEditorWindow`) —
 * a split-pane markdown workbench (`MarkdownClassificationTester`): raw
 * markdown on the left, the processing pipeline (coordinator → processor →
 * config → view) rendering structured output on the right.
 *
 * Emitter: `MarkdownClassificationTester` mounts `<SurfaceRuntimeProvider>`
 * with `createMarkdownEditorScope` — live editor + pipeline state at
 * trigger time. (The same component also renders in the fullscreen editor
 * and a dev demo; it is the same surface wherever it mounts.)
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
    key: "editor_content",
    label: "Editor content",
    sortOrder: 100,
    description: "The markdown source the user is editing.",
  },
  {
    key: "processing_pipeline",
    label: "Processing pipeline",
    sortOrder: 200,
    description:
      "Which coordinator / processor / config / view is applied and its output.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "content",
    label: "Primary content",
    description:
      "The full markdown source currently in the editor pane. Always present; empty string when the editor is blank.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    sortOrder: 200,
    group: "editor_content",
  },
  {
    name: "coordinator_id",
    label: "Coordinator",
    description:
      "Id of the coordinator preset driving the pipeline defaults (processor, config, view, samples). Always present; defaults to \"dynamic\".",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 300,
    group: "processing_pipeline",
  },
  {
    name: "sample_id",
    label: "Sample id",
    description:
      "Id of the built-in markdown sample last loaded into the editor. Empty when no sample has been chosen (custom markdown).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 310,
    group: "processing_pipeline",
  },
  {
    name: "processor_id",
    label: "Processor",
    description:
      "Id of the markdown processor currently applied to the source. Empty only in the brief window before the coordinator's default is applied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 320,
    group: "processing_pipeline",
  },
  {
    name: "config_id",
    label: "Processor config",
    description:
      "Id of the JSON config applied to the processor. Empty when the selected processor takes no config.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 330,
    group: "processing_pipeline",
  },
  {
    name: "view_id",
    label: "View",
    description:
      "Id of the custom view rendering the processed output. Empty when no view is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 340,
    group: "processing_pipeline",
  },
  {
    name: "processed_data",
    label: "Processed output",
    description:
      "The structured output of the current processor run over the markdown. Empty until a run completes. Can be large — bind explicitly when needed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 350,
    group: "processing_pipeline",
  },
  {
    name: "ast",
    label: "Markdown AST",
    description:
      "The parsed markdown AST of the current source. Empty until parsing completes. Large and low-level — bind explicitly when needed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 360,
    group: "processing_pipeline",
  },
];

export const markdownEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/markdown-editor",
  readiness: "verified",
  overlayId: "markdownEditorWindow",
  label: "Markdown Editor",
  intro: `<surface_intro>
You are on the Markdown Editor — a split-pane markdown workbench in a floating window. The user writes or pastes markdown on the left (content) and a processing pipeline (coordinator_id -> processor_id -> config_id -> view_id) renders structured output on the right. When asked to improve or transform text, operate on content: it is the live editor source, and your output should be valid markdown the pipeline can process.
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
export function createMarkdownEditorScope(values: {
  content: string;
  coordinator_id: string;
  sample_id?: string;
  processor_id?: string;
  config_id?: string;
  view_id?: string;
  processed_data?: unknown;
  ast?: unknown;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
