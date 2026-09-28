/**
 * Shared builder for the two assessment LIST surfaces —
 * `matrx-user/education-quizzes` (/education/quizzes) and
 * `matrx-user/education-practice-tests` (/education/practice-tests).
 *
 * Both pages render one component (`AssessmentHome`, parameterized by kind) on
 * the canonical list shell over `education.assessment_list_scoped`, so their
 * vocabularies are identical except for the kind's words and the write-target
 * plural. Each page still gets its OWN surface: the right-click menu's last
 * entry and the Agents menu name the page the person is on. The record,
 * create and take views keep `matrx-user/education-assessment`.
 *
 * Curated groups (band 0-899):
 *
 *   library    The page of assessments on screen (condensed bundle + rows)
 *   list_view  The live lane / search / filter / sort / archive state
 *   changes    create / update / delete the person's own assessments
 *
 * Emitter: `features/education/assessment/components/home/assessmentListSurface.ts`
 * (called from `AssessmentHome.tsx`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export interface AssessmentListWords {
  surfaceName: string;
  label: string; // "Quizzes"
  noun: string; // "quiz"
  plural: string; // "quizzes" (prose)
  targetPlural: string; // "quizzes" | "practice_tests"
  urlPattern: string;
  defaultCount: number;
  countMax: number;
  timed: boolean;
}

export function buildAssessmentListManifest(w: AssessmentListWords): SurfaceManifest {
  const groups: SurfaceValueGroup[] = [
    {
      key: "changes",
      label: `${w.label} changes`,
      sortOrder: 50,
      description: `Create, change and archive the person's own ${w.plural} — saved immediately after the person approves.`,
    },
    {
      key: "library",
      label: `${w.label} on screen`,
      sortOrder: 100,
      description: `The page of ${w.plural} the person is looking at, condensed, plus the rows behind it.`,
    },
    {
      key: "list_view",
      label: "List view",
      sortOrder: 200,
      description:
        "The live lane / search / column filter / sort / archive state deciding which rows are on screen.",
    },
  ];

  const values: SurfaceValue[] = [
    {
      name: "assessments_loaded",
      label: `${w.label} loaded`,
      description: `True once the list has loaded successfully. False while loading and after a failure — then the row values are absent and \`load_error\` explains why. Always present; never tell the person they have no ${w.plural} while this is false.`,
      valueType: "boolean",
      alwaysAvailable: true,
      typicalCharCount: 5,
      sortOrder: 300,
      group: "library",
    },
    {
      name: "assessment_list",
      label: `${w.label} list`,
      description: `The page of ${w.plural} on screen as one XML bundle: <assessments lane matching sort search archive> with one <assessment id title topic questions completed my_best depth exam status visibility updated archived/> per row (first 25). The ids are the ones update_${w.targetPlural} / delete_${w.targetPlural} take for the person's own ${w.plural}. Absent until the list has loaded.`,
      valueType: "string",
      alwaysAvailable: false,
      typicalCharCount: 2500,
      inlineUpTo: 4000,
      sortOrder: 305,
      group: "library",
    },
    {
      name: "assessment_count",
      label: `Matching ${w.plural}`,
      description: `How many ${w.plural} match the list right now — the active lane, search, filters and archive filter — across every page. Per-lane totals are on the lane tabs. Absent until the list loads.`,
      valueType: "number",
      alwaysAvailable: false,
      typicalCharCount: 3,
      sortOrder: 310,
      group: "library",
    },
    {
      name: "visible_assessments",
      label: `${w.label} on screen`,
      description: `The rows on the current page in render order as { id, title, topic, question_count, my_attempts (the person's COMPLETED attempts — unfinished ones are not counted, same as the quiz page), my_best_score (0-1 or null), my_can_edit (false = they may take it but not edit or archive it), depth, exam_type, status, visibility, updated_at, archived }. Empty array when nothing matches. Absent until the list loads. \`assessment_list\` is the same page condensed.`,
      valueType: "array",
      alwaysAvailable: false,
      typicalCharCount: 3000,
      autoContext: false,
      sortOrder: 320,
      group: "library",
    },
    {
      name: "visible_assessment_ids",
      label: `Visible ${w.noun} IDs`,
      description: "UUIDs of the rows on screen, in render order. Empty array when nothing matches. Absent until the list loads.",
      valueType: "array",
      alwaysAvailable: false,
      typicalCharCount: 400,
      sortOrder: 330,
      group: "library",
    },
    {
      name: "my_assessments",
      label: `My ${w.plural}`,
      description: `The person's OWN ${w.plural} among the rows on screen (only these can be changed by update_${w.targetPlural} / delete_${w.targetPlural}) as { id, title, topic, exam_type, depth, description, archived }. The list pages on the server, so update/delete still accept the id of any ${w.noun} the person made. Absent until the list loads; an empty array when none on screen are theirs.`,
      valueType: "array",
      alwaysAvailable: false,
      typicalCharCount: 2500,
      autoContext: false,
      sortOrder: 340,
      group: "library",
    },
    {
      name: "load_error",
      label: "Load error",
      description: "The error shown in place of the list when the query failed. Absent on the happy path — present so an agent helps with the real failure instead of assuming an empty library.",
      valueType: "string",
      alwaysAvailable: false,
      typicalCharCount: 120,
      sortOrder: 350,
      group: "library",
    },
    {
      name: "visibility_filter",
      label: "Lane",
      description: `The active lane (scope tab): "mine" (${w.plural} the person made), "orgs" (org-mates' ${w.plural} visible to the organization), "shared" (someone else's ${w.noun} granted to the person) or "public" (someone else's published ${w.noun}). Always present.`,
      valueType: "string",
      alwaysAvailable: true,
      typicalCharCount: 6,
      sortOrder: 400,
      group: "list_view",
    },
    {
      name: "search_query",
      label: "Search query",
      description: "The search text, matched case-insensitively across title, topic, exam and description. Absent when the search box is empty.",
      valueType: "string",
      alwaysAvailable: false,
      typicalCharCount: 30,
      sortOrder: 410,
      group: "list_view",
    },
    {
      name: "list_sort",
      label: "Sort",
      description: 'How the list is sorted, as "<column> <asc|desc>" — e.g. "updated desc". Columns: title, topic, questions, attempts, best_score, depth, exam_type, status, visibility, updated, created. Always present.',
      valueType: "string",
      alwaysAvailable: true,
      typicalCharCount: 14,
      sortOrder: 420,
      group: "list_view",
    },
    {
      name: "archive_filter",
      label: "Archive filter",
      description: `Which ${w.plural} the list shows: "active" (the default), "archived" or "all". Archived ones are restorable (update_${w.targetPlural} with archived: false, or Trash).`,
      valueType: "string",
      alwaysAvailable: true,
      typicalCharCount: 8,
      sortOrder: 430,
      group: "list_view",
    },
    {
      name: "list_filters",
      label: "Column filters",
      description: 'Column filters keyed by column id, e.g. { "depth": { "kind": "select", "values": ["exam"] }, "topic": { "kind": "text", "value": "bio" } }. An empty object when none is set. Always present.',
      valueType: "object",
      alwaysAvailable: true,
      typicalCharCount: 60,
      sortOrder: 440,
      group: "list_view",
    },
  ];

  const FIELDS =
    'title: string, topic?: string, description?: string, exam_type?: string, depth?: "recall" | "applied" | "exam"';

  const writeTargets: SurfaceWriteTarget[] = [
    {
      name: `create_${w.targetPlural}`,
      label: `Create ${w.plural}`,
      description: `Creates one or more EMPTY ${w.plural} (no questions yet), saved immediately as drafts in the person's active organization (they may be asked to pick one). Value is a JSON ARRAY (not a string) of 1-25 objects, each { ${FIELDS} }, e.g. [{ "title": "Cell Biology Checkpoint", "topic": "Cell biology", "depth": "applied" }]. Questions are added on the ${w.noun}'s Edit questions page, or the person generates a full ${w.noun} with New ${w.noun} (or generate_${w.targetPlural}, which is metered). A missing title, an unknown key, a bad depth, a title repeated in the list or one the person's live ${w.plural} already use refuses the whole write with every reason, and nothing is created.`,
      valueType: "array",
      updatesValue: "my_assessments",
      mode: "entity",
      applyPolicy: "ask",
      group: "changes",
      sortOrder: 110,
    },
    {
      name: `generate_${w.targetPlural}`,
      label: `Generate a ${w.noun} with AI — uses one ${w.noun} generation from the plan`,
      description: `COSTS the person one ${w.noun} generation from their plan (the same metered allowance the New ${w.noun} form shows; the plan is checked before the approval card and a spent-out plan is refused with nothing started). Runs the page's own generator: writes graded questions from a topic, or from one of the person's flashcard decks or Knowledge documents (those two are cited), and saves a ready ${w.noun}. ONE ${w.noun} per call — value is a JSON OBJECT: { source: "topic" | "deck" | "document", topic?: string (required for topic), deck?: deck id or exact name, document?: document id or exact name, question_count?: 1-${w.countMax} (default ${w.defaultCount}), difficulty?: "Easy" | "Medium" | "Hard" (default Medium), depth?: "recall" | "applied" | "exam" (default applied), question_types?: subset of multiple_choice, true_false, fill_blank, short_answer, written_response (empty = automatic mix), exam_type?: string, instructions?: string${w.timed ? ", time_limit_minutes?: 0-600 (default 20; 0 = untimed)" : ""} }. Generation takes up to a few minutes and streams in a live window. Use create_${w.targetPlural} instead for an empty draft the person fills by hand (free).`,
      valueType: "object",
      updatesValue: "my_assessments",
      mode: "entity",
      applyPolicy: "ask",
      group: "changes",
      sortOrder: 105,
    },
    {
      name: `update_${w.targetPlural}`,
      label: `Update ${w.plural}`,
      description: `Changes one or more of the person's OWN ${w.plural} (ids from my_assessments or assessment_list), saved immediately. Value is a JSON ARRAY of 1-25 objects, each { id: string (required), title?, topic?, description?, exam_type?, depth?: "recall" | "applied" | "exam" | null, archived?: boolean }. Only the fields you send change; "" or null clears topic, description, exam_type or depth. archived: true archives (restorable from Trash or the Archived filter); archived: false restores — send it in the same item to edit an archived one. Questions are not edited here. The whole list is refused, with nothing changed, on an unknown id, the same id twice, an item that changes nothing, or a rename onto a title another live ${w.noun} of the person has.`,
      valueType: "array",
      updatesValue: "my_assessments",
      mode: "entity",
      applyPolicy: "ask",
      group: "changes",
      sortOrder: 120,
    },
    {
      name: `delete_${w.targetPlural}`,
      label: `Move ${w.plural} to Trash`,
      description: `Archives one or more of the person's OWN live ${w.plural} (moves them to Trash). Value is a JSON ARRAY of ids (or { id } objects). What happens: the ${w.noun} leaves this list, its questions and past results are kept, and it is restorable from Trash (or update_${w.targetPlural} with archived: false). Unknown, repeated or already-archived ids refuse the whole list, with nothing changed.`,
      valueType: "array",
      updatesValue: "my_assessments",
      mode: "entity",
      applyPolicy: "ask",
      group: "changes",
      sortOrder: 130,
    },
  ];

  return {
    surfaceName: w.surfaceName,
    client: "matrx-user",
    executionMode: "python-stream",
    description: `${w.label} — the person's ${w.plural} on the canonical list (lanes, search, sort and filter on every column, archive); agents can generate (metered), create, change and archive the person's own ${w.plural}.`,
    readiness: "partial",
    readinessNote: `page-pass 2026-09-27: the list moved onto EntityListPage over education.assessment_list_scoped with its own surface, the assessment_list bundle and create/update/delete_${w.targetPlural}. Live agent proof is recorded in the page-pass report.`,
    label: w.label,
    urlPattern: w.urlPattern,
    intro: `<surface_intro>
You are on ${w.label} at ${w.urlPattern} — the person's LIST of ${w.plural}, not a ${w.noun} being taken. Lanes (Mine, My Orgs, Shared, Public), a search box, sort and filter on every column and an archive filter decide what is on screen; each row opens the ${w.noun}, Take starts it.
Read assessment_list first: it is the page on screen, with ids. While assessments_loaded is false the list is loading (or load_error explains a real failure) — never say the person has none. If a lane, search, filter or the archive filter narrows the list (visibility_filter, search_query, list_filters, archive_filter), say so rather than concluding a ${w.noun} does not exist.
To make a full ${w.noun} with AI questions use generate_${w.targetPlural} — it spends one generation from the person's plan, so say so before calling it. To change ${w.plural} use ONLY create_${w.targetPlural} (empty drafts), update_${w.targetPlural} (title, topic, description, exam, depth, archive/restore) and delete_${w.targetPlural} (archive), on ${w.plural} the person made. Questions are edited on each ${w.noun}'s own page.
</surface_intro>`,
    groups,
    values: mergeBaselineValues(pickBaseline("selection", "context"), values),
    writeTargets,
  };
}

/** One entry of `my_assessments`. */
export interface MyAssessmentSummary {
  id: string;
  title: string;
  topic: string | null;
  exam_type: string | null;
  depth: string | null;
  description: string | null;
  archived: boolean;
}

/** One entry of `visible_assessments`. */
export interface AssessmentListSummaryRow {
  id: string;
  title: string;
  topic: string | null;
  question_count: number;
  my_attempts: number;
  my_best_score: number | null;
  my_can_edit: boolean;
  depth: string | null;
  exam_type: string | null;
  status: string;
  visibility: string;
  updated_at: string;
  archived: boolean;
}

/** Type-safe payload: required keys mirror `alwaysAvailable: true`. */
export function createAssessmentListScope(values: {
  assessments_loaded: boolean;
  visibility_filter: string;
  list_sort: string;
  archive_filter: string;
  list_filters: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
  assessment_list?: string;
  assessment_count?: number;
  visible_assessments?: AssessmentListSummaryRow[];
  visible_assessment_ids?: string[];
  my_assessments?: MyAssessmentSummary[];
  load_error?: string;
  search_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
