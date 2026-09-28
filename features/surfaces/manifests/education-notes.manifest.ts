import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_NOTES_SURFACE_NAME = "matrx-user/education-notes";

const groups: SurfaceValueGroup[] = [
  {
    key: "notes",
    label: "Study notes",
    sortOrder: 100,
    description: "Education notes currently loaded in the Smart Notes library.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "notes_loaded",
    label: "Notes loaded",
    description:
      "True only after the Education note list finished loading without an error.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "notes",
    sortOrder: 100,
  },
  {
    name: "education_notes",
    label: "Education notes",
    description:
      "The loaded Education note rows as { id, title, tags, updated_at, version, owned }. Entries with owned false are readable here but cannot be changed from this collection.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "notes",
    sortOrder: 110,
  },
  {
    name: "owned_education_notes",
    label: "Owned Education notes",
    description:
      "The loaded Education notes created by the signed-in learner, as { id, title, tags, organization_id, version }. Only these ids may be updated or moved to Trash. Use the supplied version as expected_version for every existing-note write.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2400,
    group: "notes",
    sortOrder: 120,
  },
  {
    name: "load_error",
    label: "Load error",
    description: "The note-list read error, absent after a successful load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "notes",
    sortOrder: 130,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_education_notes",
    label: "Create study notes",
    description:
      "Creates 1-10 Education notes in the selected organization and Study Notes folder. Value is a JSON ARRAY of { title: non-empty single-line string, content?: string, tags?: string[] }. Each change asks the learner before it is saved.",
    valueType: "array",
    updatesValue: "owned_education_notes",
    mode: "entity",
    applyPolicy: "ask",
    group: "notes",
    sortOrder: 200,
  },
  {
    name: "update_education_notes",
    label: "Update study notes",
    description:
      "Updates 1-10 loaded, owned Education notes. Value is a JSON ARRAY of { id: string from owned_education_notes, expected_version: positive integer from that entry, title?: non-empty single-line string, tags?: string[] }. Include one changed field. A stale, shared, unknown, or repeated id refuses the whole write.",
    valueType: "array",
    updatesValue: "owned_education_notes",
    mode: "entity",
    applyPolicy: "ask",
    group: "notes",
    sortOrder: 210,
  },
  {
    name: "delete_education_notes",
    label: "Move study notes to Trash",
    description:
      "Soft-deletes 1-10 loaded, owned Education notes. Value is a JSON ARRAY of { id: string from owned_education_notes, expected_version: positive integer from that entry }. The note leaves this library and can be restored from Trash. A stale, shared, unknown, or repeated id refuses the whole write.",
    valueType: "array",
    updatesValue: "owned_education_notes",
    mode: "entity",
    applyPolicy: "ask",
    group: "notes",
    sortOrder: 220,
  },
];

export const educationNotesManifest: SurfaceManifest = {
  surfaceName: EDUCATION_NOTES_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description: "The Education Smart Notes collection at /education/notes.",
  label: "Smart Notes",
  urlPattern: "/education/notes",
  readiness: "partial",
  readinessNote:
    "Collection writes use the canonical Notes API with ownership and revision checks. The note detail route remains the canonical Notes editor surface.",
  intro:
    "You are in the Smart Notes collection. education_notes shows every loaded Education note. Only owned_education_notes can be changed here. Create notes with create_education_notes. For updates and Trash, use an id and its loaded expected_version; each write asks the learner first. Open a note to edit its full body through the canonical Notes surface.",
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
};

export interface EducationNoteScopeEntry {
  id: string;
  title: string;
  tags: string[];
  updated_at: string | null;
  version: number;
  owned: boolean;
}

export interface OwnedEducationNoteScopeEntry {
  id: string;
  title: string;
  tags: string[];
  organization_id: string;
  version: number;
}

export function createEducationNotesScope(values: {
  notes_loaded: boolean;
  education_notes?: EducationNoteScopeEntry[];
  owned_education_notes?: OwnedEducationNoteScopeEntry[];
  load_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
