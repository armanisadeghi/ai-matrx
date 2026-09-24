/** The Notes-backed study-guide library and focused reader. */
import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "guide", label: "Current guide", sortOrder: 100, description: "The guide being read or edited." },
  { key: "navigation", label: "Guide navigation", sortOrder: 200, description: "Available guides and the current outline." },
  { key: "study_details", label: "Study details", sortOrder: 300, description: "The learner's linked notes and key terms." },
];

const values: SurfaceValue[] = [
  { name: "guide_loaded", label: "Guide loaded", description: "True when the selected guide has loaded; false for no selection, loading, or a failed read.", valueType: "boolean", alwaysAvailable: true, typicalCharCount: 5, group: "guide", sortOrder: 300 },
  { name: "guide_id", label: "Guide ID", description: "ID of the selected guide. Absent on the library route before a guide is selected.", valueType: "string", alwaysAvailable: false, typicalCharCount: 36, group: "guide", sortOrder: 310 },
  { name: "guide_title", label: "Guide title", description: "Title of the loaded guide.", valueType: "string", alwaysAvailable: false, typicalCharCount: 100, group: "guide", sortOrder: 320 },
  { name: "guide_content", label: "Guide content", description: "Full authored content of the loaded guide, independent of highlights and notes.", valueType: "string", alwaysAvailable: false, typicalCharCount: 12000, autoContext: false, group: "guide", sortOrder: 330 },
  { name: "reader_mode", label: "Reader mode", description: "Whether the center canvas is reading or editing the current guide.", valueType: "string", alwaysAvailable: true, typicalCharCount: 7, group: "guide", sortOrder: 340 },
  { name: "available_guides", label: "Available guides", description: "The loaded guide picker entries as IDs and labels. Empty when the completed index has no guides; absent while loading or on error.", valueType: "array", alwaysAvailable: false, typicalCharCount: 1600, group: "navigation", sortOrder: 400 },
  { name: "outline", label: "Outline", description: "Headings of the current guide in reading order, with their levels and navigation indexes.", valueType: "array", alwaysAvailable: false, typicalCharCount: 2500, group: "navigation", sortOrder: 410 },
  { name: "active_details_tab", label: "Details tab", description: "Whether the right pane is showing personal notes or key terms.", valueType: "string", alwaysAvailable: true, typicalCharCount: 5, group: "study_details", sortOrder: 500 },
  { name: "personal_annotations", label: "Personal annotations", description: "The signed-in learner's loaded linked highlights and notes; absent while loading or on error. Never includes another learner's private marks.", valueType: "array", alwaysAvailable: false, typicalCharCount: 3000, autoContext: false, group: "study_details", sortOrder: 510 },
  { name: "key_terms", label: "Key terms", description: "Linked flashcard terms and definitions shown in the right pane; absent while loading or on error.", valueType: "array", alwaysAvailable: false, typicalCharCount: 3000, group: "study_details", sortOrder: 520 },
  { name: "load_error", label: "Load error", description: "The current guide or guide-index read failure; absent on a normal load.", valueType: "string", alwaysAvailable: false, typicalCharCount: 160, group: "guide", sortOrder: 350 },
  { name: "details_error", label: "Details error", description: "Notes or terms read failure for the current guide; absent when those reads succeed.", valueType: "string", alwaysAvailable: false, typicalCharCount: 160, group: "study_details", sortOrder: 530 },
];

export const educationStudyGuidesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-study-guides",
  label: "Study guides",
  urlPattern: "/education/study-guides/[id]",
  readiness: "partial",
  readinessNote: "Reader and route context are declared; annotation persistence and independent full surface certification are pending.",
  intro: "The learner reads or edits a study guide, navigates its outline, and reviews their own notes and linked flashcard terms. A failed read is not an empty guide.",
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
};

export function createEducationStudyGuidesScope(values: {
  guide_loaded: boolean;
  reader_mode: "read" | "edit";
  active_details_tab: "notes" | "terms";
  guide_id?: string;
  guide_title?: string;
  guide_content?: string;
  available_guides?: { id: string; title: string }[];
  outline?: { index: number; level: number; text: string }[];
  personal_annotations?: { id: string; kind: string; quote: string; note: string }[];
  key_terms?: { id: string; term: string; definition: string }[];
  load_error?: string;
  details_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
