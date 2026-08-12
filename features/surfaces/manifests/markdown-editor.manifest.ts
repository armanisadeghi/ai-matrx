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
  SurfaceWriteTarget,
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

/**
 * Write half of the 360 loop — what an agent may WRITE into the Markdown
 * Editor.
 *
 * The judgment bar, applied honestly. This surface has exactly ONE authored
 * field and seven pipeline readouts, and the split is not close:
 *
 * YES — `content` and, added 2026-08-10 after the exclusion below was
 * disproved live, `processor_id`. The markdown source IS the surface: everything to the
 * right of the divider is derived from it. Drafting, restructuring, tightening
 * and extending a document is the textbook agent-drafts-better case, and on a
 * CLASSIFICATION tester it is the whole point of asking an agent at all
 * ("reshape this profile so the candidate-profile processor parses it
 * cleanly"). It earns BOTH write shapes — full replacement and append — for
 * the same reason `agent-builder` splits `system_instruction` /
 * `append_system_instruction`: adding a section to a 10KB document should not
 * cost 10KB of re-sent text.
 *
 * NO — and each for its own reason, not by omission:
 *
 * - `coordinator_id` is the one that looks writable and is actively
 *   DESTRUCTIVE. Selecting a coordinator in `MarkdownClassificationTester`
 *   runs an effect that calls `setMarkdown(markdownSamples[...])` — it
 *   overwrites the editor with that coordinator's first canned sample. An
 *   agent "choosing the coordinator that suits this document" would delete
 *   the document. Never offered.
 * - `sample_id` loads a canned fixture over the editor. Same destruction, and
 *   picking which fixture to look at is identity, not drafting.
 * - `config_id` is a pipeline internal the UI itself derives: an effect resets
 *   it to the first config matching `PROCESSOR_CONFIG_TYPE_MAP[processor]`
 *   whenever the processor moves, so an agent write is order-fragile against
 *   its own processor write. Mechanical, and not stable enough to promise.
 * - `processor_id` WAS excluded here on the same "clobbered by the next effect
 *   pass" reasoning (2026-08-10). That premise turned out to be wrong and the
 *   target now ships as `pipeline_processor` — see its entry below. Neither
 *   effect reverts it: the coordinator effect writes the processor only when
 *   `selectedCoordinatorId` CHANGES (and the coordinator is not agent-
 *   writable), and the config effect resets the CONFIG, not the processor.
 *   Verified live twice through a real agent run — `heading-list` and
 *   `sectioned-list` both stuck and the pipeline re-derived against them.
 * - `view_id` stays excluded, and for a harder reason than first recorded:
 *   picking a view independently of the processor feeding it is not merely
 *   unstable, it CRASHES. From the default state (dynamic coordinator →
 *   `combined-processor`), selecting "Key Points" throws inside
 *   `KeyPointsDisplay` ("Cannot read properties of undefined (reading
 *   'title')") and `OverlayErrorBoundary` replaces the entire window with its
 *   fallback. This is PRE-EXISTING — a user clicking the same View option
 *   reproduces it exactly — and the coordinator's own `availableViews` does
 *   not gate it (it lists `keyPoints` under `dynamic`), so there is no real
 *   vocabulary to validate an agent's choice against. A sweep of all 11
 *   processors from the same state found zero crashes, which is why the
 *   processor ships and the view does not. Revisit only once the custom views
 *   guard their input.
 * - `processed_data` and `ast` are parser OUTPUT. They have no write path and
 *   must not get one — an agent moves them by writing `content` and letting
 *   the pipeline re-run. That IS the evidence loop on this surface.
 *
 * Both targets are `mode: "draft"`: the value lands through the SAME
 * `setMarkdown` that `MarkdownInput`'s `onMarkdownChange` calls for the user's
 * own keystrokes, so the preview, the AST and the processed output re-derive
 * exactly as they do while typing, and nothing is persisted anywhere. Handlers
 * live on the tester's own provider in
 * `components/mardown-display/markdown-classification/MarkdownClassificationTester.tsx`
 * and refuse while a processing run is in flight — that effect has no
 * cancellation guard, so a write landing mid-run lets the older run's
 * `ast`/`processed_data` resolve last and sit against the newer text.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "markdown_content",
    label: "Primary content",
    description:
      "REPLACES the entire markdown source in the editor pane with the string you pass, exactly as written; the live preview, the AST and the processing pipeline re-parse it immediately. This is a full replacement, not a merge: read `content` first and include everything you want kept, or use `append_markdown_content` when you only mean to add. Must be non-empty markdown — emptying the editor is a human action. Nothing is saved anywhere; the text is staged in the editor for the user to review.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_content",
    sortOrder: 100,
  },
  {
    name: "append_markdown_content",
    label: "Added content",
    description:
      "APPENDS the string you pass to the end of the current markdown source, separated by a blank line. Nothing already in the editor is touched or re-sent — pass ONLY the new text. Use this to add a section, an example or a closing block; use `markdown_content` when the whole document is being rewritten. Must be non-empty markdown. Nothing is saved anywhere; the text is staged in the editor for the user to review.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_content",
    sortOrder: 110,
  },
  {
    name: "pipeline_processor",
    label: "Processor",
    description:
      "Switches which processor parses the markdown into structured output — on a classification tester this is a CONTENT judgment: pick the one that matches how the document is actually written. Must be exactly one registered processor id: \"intro-outro-list\", \"intro-outro-nested-list\", \"heading-list\", \"sectioned-list\", \"combined-processor\", \"ast-to-json-with-config\", \"combined-processor-with-config\", \"structured-ast-with-config\", \"parser-enhanced\", \"parser-separated\", or \"parser-simple\"; anything else is rejected and the error names the live accepted set. Changing this re-runs the pipeline and, for the processors that take one, re-selects a compatible config automatically. View state only — the markdown source itself is untouched.",
    valueType: "string",
    updatesValue: "processor_id",
    mode: "ui",
    applyPolicy: "ask",
    group: "processing_pipeline",
    sortOrder: 320,
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
  writeTargets,
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
