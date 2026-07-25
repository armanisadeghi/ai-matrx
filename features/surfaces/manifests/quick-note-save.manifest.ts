/**
 * Surface manifest — Quick Note Save (`matrx-user/quick-note-save`).
 *
 * Overlay surface for the quick note capture window
 * (`features/window-panels/windows/notes/QuickNoteSaveWindow.tsx`,
 * overlay id `quickNoteSaveWindow`). Each invocation captures a text payload
 * (chat message, selection, generated content, …) into a new or existing
 * note, with a refine editor (strip thinking, trim, edit, preview). The live
 * form state (chosen title, folder, target note, editor mode, refined text)
 * lives inside `QuickNoteSaveCore` / `useQuickNoteSave` and is not yet
 * threaded up to the emitter — the window emits its opener payload. The
 * surface only exists while the window is open.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { BASELINE_VALUES, mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const QUICK_NOTE_SAVE_SURFACE_NAME = "matrx-user/quick-note-save";

const groups: SurfaceValueGroup[] = [
  {
    key: "capture_payload",
    label: "Capture payload",
    sortOrder: 100,
    description:
      "The text being captured and the defaults the opener handed the save form.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    // Baseline override: `content` IS this window's captured payload — the
    // window coerces it to a string on mount, so it is guaranteed while open.
    ...BASELINE_VALUES.content,
    description:
      "The text payload being captured into a note (the content the window opened with, before any refine edits). Always present while the window is open; may be an empty string for a blank capture.",
    alwaysAvailable: true,
    group: "capture_payload",
  },
  {
    name: "default_folder",
    label: "Default folder",
    description:
      'Folder the save form starts on (defaults to "Scratch" when the opener did not specify one). Always populated while the window is mounted. The user may pick a different folder before saving.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 310,
    group: "capture_payload",
  },
  {
    name: "default_note_name",
    label: "Default note name",
    description:
      "Pre-filled note title when the opener knew it (e.g. a chat save passes the conversation title). Absent when the opener provided none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "capture_payload",
  },
  {
    name: "initial_editor_mode",
    label: "Initial editor mode",
    description:
      'Editor mode the window opened in (e.g. "split", "plain" — openers pass "plain" for very large payloads so the preview pane does not render on mount). Absent when the opener left the default.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 330,
    group: "capture_payload",
  },
];

export const quickNoteSaveManifest: SurfaceManifest = {
  surfaceName: QUICK_NOTE_SAVE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Opener payload (content + defaults) audited and emitted; live form state inside QuickNoteSaveCore (chosen title/folder/target note/refined text) is not yet emitted",
  overlayId: "quickNoteSaveWindow",
  label: "Quick Note Save",
  intro: `<surface_intro>
You are in the Quick Note Save floating window — a capture form for saving a text payload (a chat message, a selection, generated content) into a new or existing note. The baseline content value carries the captured text as the window opened with it; Capture payload also holds the folder and title defaults the opener seeded. The user refines the text and picks a destination before saving — these values describe how the capture STARTED, not necessarily what will be saved.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createQuickNoteSaveScope(values: {
  content: string;
  default_folder: string;
  default_note_name?: string;
  initial_editor_mode?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
