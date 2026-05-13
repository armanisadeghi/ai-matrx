/**
 * Surface manifest — Notes editor (`matrx-user/notes`).
 *
 * This is one of the two Phase 1 proof-of-concept manifests. It demonstrates
 * a mix of baseline values (inherited via spread) and surface-specific
 * declarations (`current_note_id`, `current_note_title`, `open_note_ids`).
 *
 * The surface code is expected to emit an `ApplicationScope` whose keys are
 * a superset of `alwaysAvailable: true` entries here. The optional helper
 * `createNotesScope` below makes that contract type-safe.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/tool-registry/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_note_id",
    label: "Active note id",
    description:
      "UUID of the note the user has open. Empty when no note is open (e.g. on the notes list).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "current_note_title",
    label: "Active note title",
    description:
      "Human title of the currently open note. Empty when no note is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "current_note_category",
    label: "Active note category",
    description:
      "Category name of the currently open note. Empty when uncategorized or no note open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 32,
    sortOrder: 320,
  },
  {
    name: "open_note_ids",
    label: "Open note ids",
    description:
      "Array of UUIDs of notes currently open in tabs/panes. Empty when nothing is open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 360,
    sortOrder: 400,
  },
];

export const notesEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/notes",
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. The notes surface calls this when assembling its
 * `ApplicationScope` so TS catches missing required keys and unknown keys.
 *
 * Keys marked `alwaysAvailable: true` are required at the type level; the
 * rest are optional. The compiler can't introspect runtime values, but it
 * can enforce the shape — that's the "a UI cannot lie" enforcement.
 */
export function createNotesScope(values: {
  // alwaysAvailable: true → required
  open_note_ids: string[];
  // alwaysAvailable: false → optional
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  current_note_id?: string;
  current_note_title?: string;
  current_note_category?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
