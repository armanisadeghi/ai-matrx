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
 *
 * READ and WRITE: the window publishes the scope, but the form state a write
 * lands in belongs to `QuickNoteSaveCore`, so the `note_draft` handler is
 * registered from there with `useSurfaceWriteHandlers` rather than through the
 * provider's `getWriteHandlers` — the seam built for exactly this split. See
 * the `writeTargets` block below for which fields earn a target and why the
 * save mode gates them.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  NOTE_DRAFT_FIELDS,
  SAVE_MODES,
  UPDATE_METHODS,
} from "@/features/notes/actions/quick-save/quickNoteSaveVocabulary";
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
  {
    // The folder picker's whole vocabulary — declared because the `note_draft`
    // write target refuses a folder that is not already in this list, so an
    // agent that cannot read the list can only guess and be refused.
    name: "all_folder_names",
    label: "All folder names",
    description:
      "Every folder name the save form's Folder picker offers, in display order — the user's note folders plus the opener's default folder when it is not among them. This is the ONLY vocabulary the `folder` field of the `note_draft` write target accepts; a name outside this list is refused rather than created. Always present while the window is open (at minimum the default folder).",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 160,
    sortOrder: 340,
    group: "capture_payload",
  },
];

/**
 * Write half of this surface (handlers in `QuickNoteSaveCore`, registered via
 * `useSurfaceWriteHandlers` — the window owns the surface, the core owns the
 * form state).
 *
 * ONE composite target, deliberately. The title, the refined body, and the
 * destination folder are filled in during a SINGLE act of capture and consumed
 * by ONE save, which is exactly the case the skill reserves for an object
 * target. Splitting them would also make this form's cross-field rule
 * unenforceable: the save MODE decides which inputs are even rendered, so a
 * lone `note_name` write while the form is in "update" mode would land in
 * state the user cannot see. One target validates the whole shape against the
 * live mode, asks once, and stages a coherent capture.
 *
 * WHAT IS NOT A TARGET, and why:
 * - Saving. The human presses Save Note; that is where the note is created or
 *   an existing one is written.
 * - The save mode and the target note (`mode`, the selected note). Pointing
 *   this capture at an existing note is the decision that can destroy the
 *   user's writing, so an agent never makes it.
 * - The update method (`append` / `overwrite`). Choosing `overwrite` is the
 *   destructive half of that decision and stays human, behind its own confirm
 *   dialog.
 *
 * MODE MATTERS, and the handler enforces it:
 * - `note_name` and `folder` describe a NEW note. They are accepted only while
 *   the form is in "create" mode. In "update" mode the title input is not
 *   rendered at all and the folder select is a filter over which existing
 *   notes are listed — changing it there would silently drop the user's chosen
 *   target note.
 * - `content` is accepted in "create" mode and in "update" + "append" (where
 *   the text is added after the existing body). It is REFUSED in "update" +
 *   "overwrite": there the staged text would replace an existing note's body
 *   wholesale, and that text stays the user's to choose.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "note_draft",
    label: "Note capture draft",
    description: [
      "Stages the note this window is about to save — the same fields the user would type into the open form, staged the same way.",
      `Object with any of: ${NOTE_DRAFT_FIELDS.join(", ")} — all strings.`,
      "Only the keys you send are changed; omit a key to leave the user's value alone. No key may be empty or whitespace-only — send a real title, a real folder, or real body text, or omit the field.",
      "`note_name` is the new note's title (the single most useful thing to write here: the user captured a blob of text and needs it named). `content` is the refined body — the captured text cleaned up, thinking blocks stripped, trimmed or restructured; it REPLACES the whole body, so read the `content` value first and send back the complete text you want, not a fragment. `folder` files the note and must be an exact, case-sensitive name from `all_folder_names`; a name outside that list is refused rather than created.",
      `The form has two save modes (${SAVE_MODES.join(" | ")}) and the mode gates what may be written. In "create" (a brand-new note) all three fields are accepted. In "update" (saving into an EXISTING note) \`note_name\` and \`folder\` are refused — the title input is not rendered and the folder select only filters which notes are listed, so writing it would drop the user's chosen target note.`,
      `In "update" mode \`content\` depends on the update method (${UPDATE_METHODS.join(" | ")}): with "append" it is accepted, because the text is added after the existing body; with "overwrite" it is REFUSED, because the staged text would replace an existing note's body wholesale. If you need that, ask the user to switch the form rather than working around it.`,
      "Everything is staged only — nothing is written to a note until the user presses Save Note, and once a note has been saved from this window the form is read-only and every write is refused.",
      "You cannot save, choose the save mode, pick the target note, or set the update method — those stay with the user.",
    ].join(" "),
    valueType: "object",
    // No `updatesValue`: the live form state (chosen title, folder, refined
    // text) is not emitted by this surface yet — see `readinessNote`. The
    // opener-payload values above describe how the capture STARTED, so
    // pointing at one of them would advertise a read twin that never reflects
    // the write. `all_folder_names` is the vocabulary for one field, not a
    // twin of the composite.
    mode: "draft",
    applyPolicy: "ask",
    group: "capture_payload",
    sortOrder: 400,
  },
];

export const quickNoteSaveManifest: SurfaceManifest = {
  surfaceName: QUICK_NOTE_SAVE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Opener payload (content + defaults + folder vocabulary) audited and emitted, and the write half (note_draft) is registered and live-verified against a real agent run; live form state inside QuickNoteSaveCore (chosen title/folder/target note/refined text) is still not emitted, so note_draft declares no updatesValue",
  overlayId: "quickNoteSaveWindow",
  label: "Quick Note Save",
  intro: `<surface_intro>
You are in the Quick Note Save floating window — a capture form for saving a text payload (a chat message, a selection, generated content) into a new or existing note. The baseline content value carries the captured text as the window opened with it; Capture payload also holds the folder and title defaults the opener seeded, plus every folder name the picker offers. The user refines the text and picks a destination before saving — these values describe how the capture STARTED, not necessarily what will be saved.
You can also WRITE to this surface through the single note_draft target: the note's title, its refined body, and the folder it is filed into. This is the moment those are worth writing — the user has captured a blob of text and needs it named, cleaned up, and filed. Everything you send is STAGED into the open form; the user reviews it and presses Save Note.
What you write depends on the form's save mode. Creating a new note accepts all three fields. Saving into an EXISTING note accepts only the body, and only when the update method is append — a title and a folder have no meaning there, and replacing an existing note's body is the user's call. You cannot save, switch the mode, pick the target note, or set the update method.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
  writeTargets,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createQuickNoteSaveScope(values: {
  content: string;
  default_folder: string;
  all_folder_names: string[];
  default_note_name?: string;
  initial_editor_mode?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
