import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_TUTOR_HISTORY_SURFACE_NAME =
  "matrx-user/education-tutor-history";

const groups: SurfaceValueGroup[] = [
  {
    key: "conversations",
    label: "Tutor conversations",
    description: "The signed-in learner's loaded AI Tutor conversations.",
    sortOrder: 100,
  },
];

const values: SurfaceValue[] = [
  {
    name: "owned_tutor_conversations",
    label: "Owned loaded tutor conversations",
    description:
      "The signed-in learner's loaded AI Tutor rows as { id, title, status }. Only these exact ids can be changed from this page. Shared, unloaded, and non-tutor conversations are excluded.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    inlineUpTo: 3000,
    group: "conversations",
    sortOrder: 100,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "rename_tutor_conversation",
    label: "Rename tutor conversation",
    description:
      "Renames one owned, loaded AI Tutor conversation immediately. Value is { conversation_id: string from owned_tutor_conversations, title: non-empty string }. Shared, unloaded, and non-tutor ids are refused before approval.",
    valueType: "object",
    updatesValue: "owned_tutor_conversations",
    mode: "entity",
    applyPolicy: "ask",
    group: "conversations",
    sortOrder: 200,
  },
  {
    name: "archive_tutor_conversation",
    label: "Archive or restore tutor conversation",
    description:
      "Archives or restores one owned, loaded AI Tutor conversation immediately. Value is { conversation_id: string from owned_tutor_conversations, archived: boolean }; true archives and false restores. Shared, unloaded, and non-tutor ids are refused before approval.",
    valueType: "object",
    updatesValue: "owned_tutor_conversations",
    mode: "entity",
    applyPolicy: "ask",
    group: "conversations",
    sortOrder: 210,
  },
  {
    name: "delete_tutor_conversation",
    label: "Move tutor conversation to Trash",
    description:
      "Soft-deletes one owned, loaded AI Tutor conversation. Value is { conversation_id: string from owned_tutor_conversations }. Its transcript moves to Trash and can be restored there; prefer archive when appropriate. Shared, unloaded, and non-tutor ids are refused before approval.",
    valueType: "object",
    updatesValue: "owned_tutor_conversations",
    mode: "entity",
    applyPolicy: "ask",
    group: "conversations",
    sortOrder: 220,
  },
];

export const educationTutorHistoryManifest: SurfaceManifest = {
  surfaceName: EDUCATION_TUTOR_HISTORY_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description: "The AI Tutor conversation list at /education/tutor.",
  label: "AI Tutor conversations",
  urlPattern: "/education/tutor",
  readiness: "partial",
  readinessNote:
    "Conversation writes are constrained to owned rows already loaded by the canonical Tutor history list and use the canonical conversation thunks.",
  intro:
    "You are on the AI Tutor conversation list. owned_tutor_conversations contains only the learner's currently loaded tutor rows. Use the rename, archive, or Trash target only with an id from that value. Every change asks the learner first. Do not change a shared, unloaded, or non-tutor conversation.",
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
};

export function createEducationTutorHistoryScope(values: {
  owned_tutor_conversations: Array<{
    id: string;
    title: string | null;
    status: string;
  }>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
