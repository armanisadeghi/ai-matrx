/** The persisted `seo.site_keyword_value.workflow_status` vocabulary. */
export const KEYWORD_WORKFLOW_STATUSES = [
  "candidate",
  "targeted",
  "in_progress",
  "ranking",
  "ignored",
  "suppressed",
] as const;

export type KeywordWorkflowStatus = (typeof KEYWORD_WORKFLOW_STATUSES)[number];

export const EDITABLE_KEYWORD_WORKFLOW_STATUSES = [
  "candidate",
  "targeted",
  "in_progress",
  "ranking",
  "ignored",
] as const satisfies readonly KeywordWorkflowStatus[];

export type EditableKeywordWorkflowStatus =
  (typeof EDITABLE_KEYWORD_WORKFLOW_STATUSES)[number];

interface KeywordWorkflowStage {
  value: KeywordWorkflowStatus | null;
  label: string;
  description: string;
}

export const KEYWORD_WORKFLOW_STAGES: readonly KeywordWorkflowStage[] = [
  {
    value: null,
    label: "Not tracked",
    description:
      "No site-specific decision has been made for this keyword yet.",
  },
  {
    value: "candidate",
    label: "Opportunity",
    description: "Worth evaluating, but not yet committed to the SEO plan.",
  },
  {
    value: "targeted",
    label: "Targeted",
    description:
      "Chosen for the SEO plan and assigned to a page or initiative.",
  },
  {
    value: "in_progress",
    label: "In progress",
    description: "SEO work for this keyword is actively underway.",
  },
  {
    value: "ranking",
    label: "Ranking",
    description:
      "The site is ranking for this keyword and the result is being maintained.",
  },
  {
    value: "ignored",
    label: "Not pursuing",
    description: "Reviewed and intentionally left out of the current SEO plan.",
  },
  {
    value: "suppressed",
    label: "Excluded by strategy",
    description: "Excluded by a strategy rule with a recorded reason.",
  },
];

export function isKeywordWorkflowStatus(
  value: unknown,
): value is KeywordWorkflowStatus {
  return (
    typeof value === "string" &&
    KEYWORD_WORKFLOW_STATUSES.some((status) => status === value)
  );
}

export function isEditableKeywordWorkflowStatus(
  value: unknown,
): value is EditableKeywordWorkflowStatus {
  return (
    typeof value === "string" &&
    EDITABLE_KEYWORD_WORKFLOW_STATUSES.some((status) => status === value)
  );
}

export function keywordWorkflowStage(
  value: string | null,
): KeywordWorkflowStage {
  return (
    KEYWORD_WORKFLOW_STAGES.find((stage) => stage.value === value) ?? {
      value: null,
      label: "Unknown stage",
      description: `This record has an unrecognized SEO stage (${value ?? "empty"}).`,
    }
  );
}

export const KEYWORD_WORKFLOW_FILTER_OPTIONS = KEYWORD_WORKFLOW_STAGES.filter(
  (stage): stage is KeywordWorkflowStage & { value: KeywordWorkflowStatus } =>
    stage.value !== null,
).map(({ value, label }) => ({ value, label }));

export const KEYWORD_WORKFLOW_EDIT_OPTIONS = KEYWORD_WORKFLOW_STAGES.filter(
  (
    stage,
  ): stage is KeywordWorkflowStage & {
    value: EditableKeywordWorkflowStatus;
  } => stage.value !== null && isEditableKeywordWorkflowStatus(stage.value),
).map(({ value, label }) => ({ value, label }));
