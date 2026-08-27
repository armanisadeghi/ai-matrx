import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  IDEAL_LIST_ITEMS,
  LIST_SECTIONS,
  MAX_LIST_ITEMS,
  MIN_LIST_ITEMS,
  OVERALL_OPTIONS,
  RATING_SCHEMA,
  SCALE_LEGEND,
} from "@/features/employee-performance-reviews/schema";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const PERFORMANCE_REVIEW_SURFACE_NAME =
  "matrx-user/organization-performance-reviews";

export function performanceReviewRatingSurfaceName(
  categoryKey: string,
  itemKey: string,
): string {
  return `rating_${categoryKey}_${itemKey}`;
}

const groups: SurfaceValueGroup[] = [
  {
    key: "organization_context",
    label: "Organization context",
    sortOrder: 50,
  },
  { key: "review_identity", label: "Review identity", sortOrder: 100 },
  { key: "employee_details", label: "Employee details", sortOrder: 200 },
  { key: "review_narrative", label: "Review narrative", sortOrder: 300 },
  {
    key: "performance_ratings",
    label: "Performance ratings",
    sortOrder: 400,
  },
  { key: "review_close", label: "Review close", sortOrder: 500 },
  { key: "review_summary", label: "Review summary", sortOrder: 600 },
  { key: "available_inputs", label: "Available inputs", sortOrder: 700 },
  { key: "page_state", label: "Page state", sortOrder: 800 },
];

const ratingValues: SurfaceValue[] = RATING_SCHEMA.flatMap((category, ci) =>
  category.items.map((item, ii) => ({
    name: performanceReviewRatingSurfaceName(category.key, item.key),
    label: item.label,
    description: `The active review's 1-5 rating for ${item.label.toLowerCase()} in ${category.label}. Empty when this question has not been rated.`,
    valueType: "number" as const,
    alwaysAvailable: false,
    typicalCharCount: 1,
    autoContext: false,
    group: "performance_ratings",
    sortOrder: 200 + ci * 20 + ii,
  })),
);

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "organization_id",
    label: "Organization ID",
    description:
      "Resolved UUID of the organization in this route. This is the explicit organization_id for the future persistent writer; the current browser draft is not durable tenant storage. Empty on the retained demo route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "organization_context",
    sortOrder: 10,
  },
  {
    name: "organization_slug",
    label: "Organization slug",
    description:
      "Route slug of the organization containing this page. Empty on the retained demo route or when the route used a UUID.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "organization_context",
    sortOrder: 20,
  },
  {
    name: "organization_name",
    label: "Organization name",
    description:
      "Display name of the organization containing this page. Empty on the retained demo route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    group: "organization_context",
    sortOrder: 30,
  },
  {
    name: "viewer_role",
    label: "Viewer role",
    description:
      "The current viewer's organization role: owner, admin, or member. Empty on the retained demo route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "organization_context",
    sortOrder: 40,
  },
  {
    name: "active_review_id",
    label: "Active review ID",
    description:
      "Browser-local identifier of the review currently open in the editor. Changes when the user selects another review.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 32,
    group: "review_identity",
    sortOrder: 10,
  },
  {
    name: "active_review_created_at",
    label: "Review created at",
    description:
      "Unix timestamp in milliseconds when the active browser-local review was created.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 13,
    autoContext: false,
    group: "review_identity",
    sortOrder: 20,
  },
  {
    name: "active_review_updated_at",
    label: "Review updated at",
    description:
      "Unix timestamp in milliseconds of the active review's latest local edit.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 13,
    autoContext: false,
    group: "review_identity",
    sortOrder: 30,
  },
  {
    name: "active_review",
    label: "Active review",
    description:
      "Composite object containing every current field of the active review. It mirrors the individual values and includes live autosaving edits.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 7000,
    autoContext: false,
    group: "review_identity",
    sortOrder: 40,
  },
  {
    name: "employee_name",
    label: "Employee Name",
    description:
      "Employee name entered on the active review. Empty until the reviewer provides it; this interim page has no employee-record ID yet.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 100,
    group: "employee_details",
    sortOrder: 10,
  },
  {
    name: "job_title",
    label: "Title",
    description:
      "Job title entered on the active review. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 100,
    group: "employee_details",
    sortOrder: 20,
  },
  {
    name: "department",
    label: "Department",
    description:
      "Department entered on the active review. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 100,
    group: "employee_details",
    sortOrder: 30,
  },
  {
    name: "date_of_hire",
    label: "Date of Hire",
    description:
      "Date-only YYYY-MM-DD value entered for the employee's hire date. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "employee_details",
    sortOrder: 40,
  },
  {
    name: "review_period",
    label: "Review Period",
    description:
      "Human-readable period covered by the active review. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "employee_details",
    sortOrder: 50,
  },
  {
    name: "date_of_evaluation",
    label: "Date of Evaluation",
    description:
      "Date-only YYYY-MM-DD value entered for the evaluation date. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "employee_details",
    sortOrder: 60,
  },
  ...LIST_SECTIONS.map((section, index): SurfaceValue => ({
    name: section.key,
    label: section.title,
    description: `Ordered list of ${section.title.toLowerCase()} in the active review. It can contain ${MIN_LIST_ITEMS}-${MAX_LIST_ITEMS} items; the ideal number is three. Empty while the section has no answers.`,
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    group: "review_narrative",
    sortOrder: 10 + index * 10,
  })),
  {
    name: "ratings",
    label: "All ratings",
    description:
      "Composite object of every answered performance-rating key and its 1-5 value. Unanswered questions are omitted.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1400,
    group: "performance_ratings",
    sortOrder: 10,
  },
  ...ratingValues,
  {
    name: "goals",
    label: "Goals & Objectives",
    description:
      "Long-form goals and objectives entered for the coming review period. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1600,
    group: "review_close",
    sortOrder: 10,
  },
  {
    name: "overall_rating",
    label: "Overall Performance Rating",
    description:
      "Selected overall rating key. Empty until one of the declared overall_rating_options is chosen.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    group: "review_close",
    sortOrder: 20,
  },
  {
    name: "overall_rating_label",
    label: "Overall rating label",
    description:
      "Human label rendered for the selected overall rating. It is Not set until a rating is chosen.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    autoContext: false,
    group: "review_close",
    sortOrder: 30,
  },
  {
    name: "additional_comments",
    label: "Additional Comments",
    description:
      "Long-form closing comments entered on the active review. Empty until provided.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1800,
    group: "review_close",
    sortOrder: 40,
  },
  {
    name: "average_score",
    label: "Average score",
    description:
      "Average of the answered 1-5 rating questions. Empty until at least one question is rated.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "review_summary",
    sortOrder: 10,
  },
  {
    name: "rated_count",
    label: "Items rated",
    description:
      "Number of performance-rating questions currently answered. Zero when none are rated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "review_summary",
    sortOrder: 20,
  },
  {
    name: "total_rating_count",
    label: "Total rating items",
    description:
      "Total number of rating questions available in the fixed review questionnaire.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "review_summary",
    sortOrder: 30,
  },
  {
    name: "completion_percent",
    label: "Completion percent",
    description:
      "Percentage shown in the page's completion indicator for the active review.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "review_summary",
    sortOrder: 40,
  },
  {
    name: "category_averages",
    label: "Category averages",
    description:
      "Object mapping each performance-rating category key to its displayed average, or null when no item in that category is rated.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    autoContext: false,
    group: "review_summary",
    sortOrder: 50,
  },
  {
    name: "review_summary",
    label: "Review summary",
    description:
      "Composite object mirroring average score, rated count, total rating count, completion percent, category averages, and overall rating label.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 600,
    group: "review_summary",
    sortOrder: 60,
  },
  {
    name: "question_outline",
    label: "Question outline",
    description:
      "Structured inventory of every available section and question without answers. Always available and suitable for planning a complete response.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    group: "available_inputs",
    sortOrder: 10,
  },
  {
    name: "list_section_rules",
    label: "Narrative section rules",
    description:
      "Available narrative-section keys, labels, and quantity guidance. Each allows 2-5 items and the ideal number is three.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1000,
    autoContext: false,
    group: "available_inputs",
    sortOrder: 20,
  },
  {
    name: "rating_questions",
    label: "Rating questions",
    description:
      "Complete rating-category and question inventory with stable keys and labels, without answers.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    group: "available_inputs",
    sortOrder: 30,
  },
  {
    name: "rating_scale",
    label: "Rating scale",
    description:
      "The five allowed numeric rating values and their human labels.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    autoContext: false,
    group: "available_inputs",
    sortOrder: 40,
  },
  {
    name: "overall_rating_options",
    label: "Overall rating options",
    description:
      "Allowed overall-rating keys, labels, and guidance shown on the page.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    autoContext: false,
    group: "available_inputs",
    sortOrder: 50,
  },
  {
    name: "reviews_summary",
    label: "Saved reviews",
    description:
      "Summary rows for every review saved in this browser and organization scope. Includes only the identity fields rendered in the review picker.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    autoContext: false,
    group: "page_state",
    sortOrder: 10,
  },
  {
    name: "review_count",
    label: "Review count",
    description:
      "Number of reviews saved in the current browser and organization scope.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "page_state",
    sortOrder: 20,
  },
  {
    name: "current_view",
    label: "Current view",
    description:
      "Current page mode: edit for the form or report for the finished two-page preview.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "page_state",
    sortOrder: 30,
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "Current review-list search text. Empty when the list is unfiltered.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    autoContext: false,
    group: "page_state",
    sortOrder: 40,
  },
  {
    name: "save_state",
    label: "Save state",
    description:
      "Current browser-local autosave state: idle, saving, or saved.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    autoContext: false,
    group: "page_state",
    sortOrder: 50,
  },
  {
    name: "is_exporting_pdf",
    label: "PDF export running",
    description:
      "True while the page is building a downloadable PDF; false otherwise.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    autoContext: false,
    group: "page_state",
    sortOrder: 60,
  },
];

const immediateTextTarget = (
  name: string,
  label: string,
  description: string,
  group: string,
  sortOrder: number,
): SurfaceWriteTarget => ({
  name,
  label,
  description: `${description} The accepted value is saved immediately through the page's existing browser-local autosave path.`,
  valueType: "string",
  updatesValue: name,
  mode: "entity",
  applyPolicy: "ask",
  group,
  sortOrder,
});

const writeTargets: SurfaceWriteTarget[] = [
  immediateTextTarget(
    "employee_name",
    "Employee Name",
    "Sets the active review's employee name to a plain string; an empty string clears it.",
    "employee_details",
    10,
  ),
  immediateTextTarget(
    "job_title",
    "Title",
    "Sets the active review's job title to a plain string; an empty string clears it.",
    "employee_details",
    20,
  ),
  immediateTextTarget(
    "department",
    "Department",
    "Sets the active review's department to a plain string; an empty string clears it.",
    "employee_details",
    30,
  ),
  immediateTextTarget(
    "date_of_hire",
    "Date of Hire",
    "Sets the date of hire to YYYY-MM-DD; an empty string clears it.",
    "employee_details",
    40,
  ),
  immediateTextTarget(
    "review_period",
    "Review Period",
    "Sets the human-readable review period; an empty string clears it.",
    "employee_details",
    50,
  ),
  immediateTextTarget(
    "date_of_evaluation",
    "Date of Evaluation",
    "Sets the evaluation date to YYYY-MM-DD; an empty string clears it.",
    "employee_details",
    60,
  ),
  ...LIST_SECTIONS.map((section, index): SurfaceWriteTarget => ({
    name: section.key,
    label: section.title,
    description: `Replaces the FULL ordered ${section.title.toLowerCase()} list. Value is an array of 0-${MAX_LIST_ITEMS} non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's browser-local autosave path.`,
    valueType: "array",
    updatesValue: section.key,
    mode: "entity",
    applyPolicy: "ask",
    group: "review_narrative",
    sortOrder: 100 + index * 10,
  })),
  ...RATING_SCHEMA.flatMap((category, ci) =>
    category.items.map((item, ii): SurfaceWriteTarget => ({
      name: performanceReviewRatingSurfaceName(category.key, item.key),
      label: item.label,
      description: `Sets the ${category.label} rating for ${item.label.toLowerCase()}. Value must be one whole number from 1 to 5. The accepted rating is saved immediately through the page's browser-local autosave path.`,
      valueType: "number",
      updatesValue: performanceReviewRatingSurfaceName(category.key, item.key),
      mode: "entity",
      applyPolicy: "ask",
      group: "performance_ratings",
      sortOrder: 200 + ci * 20 + ii,
    })),
  ),
  immediateTextTarget(
    "goals",
    "Goals & Objectives",
    "Replaces the active review's complete goals and objectives text. Read the existing value first if the intent is to append.",
    "review_close",
    10,
  ),
  immediateTextTarget(
    "overall_rating",
    "Overall Performance Rating",
    `Sets the overall rating to one of: ${OVERALL_OPTIONS.map((option) => option.key).join(" | ")}; an empty string clears it.`,
    "review_close",
    20,
  ),
  immediateTextTarget(
    "additional_comments",
    "Additional Comments",
    "Replaces the active review's complete additional-comments text. Read the existing value first if the intent is to append.",
    "review_close",
    30,
  ),
];

export const organizationPerformanceReviewsManifest: SurfaceManifest = {
  surfaceName: PERFORMANCE_REVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "The exhaustive values, handlers, canonical copy controls, organization route, demo mount, and static checks are complete; real-agent writeback and independent browser certification are pending.",
  label: "Organization Performance Reviews",
  urlPattern: "/organizations/[orgId]/performance-reviews",
  intro: `<surface_intro>
You are on an interim organization-scoped Performance Reviews surface. The user is drafting one employee review, checking its completion, and previewing or exporting a finished two-page report; this is intentionally separate from the future HR module.
Read active_review and the individual values as the live form state. question_outline, list_section_rules, rating_questions, rating_scale, and overall_rating_options describe every available input without supplying answers. Narrative lists allow 2-5 items and the ideal number is three.
This interim page autosaves to this browser under the organization rather than to the production HR database. Employee names are plain form text with no employee-record identity yet. Agent writes ask for confirmation and then use the same browser-local autosave path as human edits.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface OrganizationPerformanceReviewScopeInput extends SurfaceScopePayload {
  active_review_id: string;
  active_review_created_at: number;
  active_review_updated_at: number;
  active_review: Record<string, unknown>;
  employee_name: string;
  job_title: string;
  department: string;
  date_of_hire: string;
  review_period: string;
  date_of_evaluation: string;
  responsibilities: string[];
  accomplishments: string[];
  strengths: string[];
  opportunities: string[];
  ratings: Record<string, number>;
  goals: string;
  overall_rating: string;
  overall_rating_label: string;
  additional_comments: string;
  rated_count: number;
  total_rating_count: number;
  completion_percent: number;
  category_averages: Record<string, number | null>;
  review_summary: Record<string, unknown>;
  question_outline: Record<string, unknown>;
  list_section_rules: unknown[];
  rating_questions: unknown[];
  rating_scale: unknown[];
  overall_rating_options: unknown[];
  reviews_summary: unknown[];
  review_count: number;
  current_view: "edit" | "report";
  search_query: string;
  save_state: "idle" | "saving" | "saved";
  is_exporting_pdf: boolean;
}

export function createOrganizationPerformanceReviewScope(
  values: OrganizationPerformanceReviewScopeInput,
): SurfaceScopePayload {
  return values;
}

export const PERFORMANCE_REVIEW_STATIC_INPUTS = {
  __kind: "performance_review_available_inputs",
  list_section_rules: LIST_SECTIONS.map((section) => ({
    __kind: "performance_review_list_rule",
    name: section.key,
    label: section.title,
    description: section.description,
    minimum_items: MIN_LIST_ITEMS,
    ideal_items: IDEAL_LIST_ITEMS,
    maximum_items: MAX_LIST_ITEMS,
  })),
  rating_questions: RATING_SCHEMA.map((category) => ({
    __kind: "performance_review_rating_category",
    name: category.key,
    label: category.label,
    questions: category.items.map((item) => ({
      __kind: "performance_review_rating_question",
      name: performanceReviewRatingSurfaceName(category.key, item.key),
      label: item.label,
    })),
  })),
  rating_scale: SCALE_LEGEND.map((entry) => ({
    __kind: "performance_review_rating_option",
    value: entry.value,
    label: entry.label,
  })),
  overall_rating_options: OVERALL_OPTIONS.map((option) => ({
    __kind: "performance_review_overall_option",
    key: option.key,
    label: option.label,
    description: option.description,
  })),
};
