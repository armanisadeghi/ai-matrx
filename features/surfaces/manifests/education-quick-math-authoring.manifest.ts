import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_QUICK_MATH_AUTHORING_SURFACE_NAME = "matrx-user/education-quick-math-authoring";

const groups: SurfaceValueGroup[] = [
  { key: "library", label: "Quick Math library", sortOrder: 100, description: "The staff-visible catalog of active Quick Math problems." },
];

const values: SurfaceValue[] = [
  {
    name: "problems_loaded", label: "Problems loaded", description: "True once the authoring catalog has finished loading. Always present.",
    valueType: "boolean", alwaysAvailable: true, typicalCharCount: 5, sortOrder: 100, group: "library",
  },
  {
    name: "problem_count", label: "Problem count", description: "How many active Quick Math problems the authoring catalog contains.",
    valueType: "number", alwaysAvailable: true, typicalCharCount: 3, sortOrder: 110, group: "library",
  },
  {
    name: "math_problems", label: "Quick Math problems", description: "The active Quick Math catalog, each { id, title, course_name, topic_name, module_name, difficulty_level, sort_order, is_published, version }. Use ids only with the declared CRUD targets.",
    valueType: "array", alwaysAvailable: true, typicalCharCount: 4000, inlineUpTo: 4000, sortOrder: 120, group: "library",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_math_problems", label: "Create Quick Math problems", description: "Create draft Quick Math problems immediately after approval. Value is a JSON ARRAY of 1-25 objects, each { title, course_name, topic_name, module_name, problem_statement: { text, equation, instruction }, solutions: [...], description?, intro_text?, final_statement?, hint?, difficulty_level?: 'easy'|'medium'|'hard'|null, sort_order?: non-negative integer }. Every required text field is non-empty. New agent-created problems stay unpublished and internal; only a human can publish them.", valueType: "array", updatesValue: "math_problems", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 100,
  },
  {
    name: "update_math_problems", label: "Update Quick Math problems", description: "Update active Quick Math problems immediately after approval. Value is a JSON ARRAY of 1-25 objects, each { id, version, ...fields_to_change }, using id and version from math_problems and the same editable fields as create_math_problems. At least one editable field is required. A changed revision is refused. Publishing and publishing to the web remain human-only controls.", valueType: "array", updatesValue: "math_problems", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 110,
  },
  {
    name: "delete_math_problems", label: "Delete Quick Math problems", description: "Soft-delete active Quick Math problems after approval. Value is a JSON ARRAY of { id, version } objects from math_problems. A changed revision is refused. Deleted problems leave the learner list and authoring catalog; prefer update_math_problems for ordinary content corrections.", valueType: "array", updatesValue: "math_problems", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 120,
  },
];

export const educationQuickMathAuthoringManifest: SurfaceManifest = {
  surfaceName: EDUCATION_QUICK_MATH_AUTHORING_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  label: "Quick Math authoring",
  description: "Super-admin authoring for the persisted Quick Math problem catalog.",
  readiness: "partial",
  readinessNote: "Emitter and approval-gated CRUD handlers are in the admin authoring screen. Publishing remains a deliberate human-only action. DB manifest sync and live agent probe are pending.",
  urlPattern: "/education/subjects/quick-math/admin",
  intro: `<surface_intro>You are on the Quick Math AUTHORING page, a staff-only catalog editor. math_problems lists live editable records. Use create_math_problems, update_math_problems, and delete_math_problems for catalog changes; each asks for approval and uses the same RLS-gated path as the screen. Do not attempt to publish or expose a problem: publishing and publishing to the web remain human-only because that changes public content.</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
};

export function createEducationQuickMathAuthoringScope(values: {
  problems_loaded: boolean;
  problem_count: number;
  math_problems: Array<{
    id: string;
    title: string;
    course_name: string;
    topic_name: string;
    module_name: string;
    difficulty_level: string | null;
    sort_order: number | null;
    is_published: boolean | null;
    version: number;
  }>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values;
}
